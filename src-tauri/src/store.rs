//! Workspace/graph store — SQLite persistence (domain logic; tests use an in-memory DB).
//!
//! Graphs are stored as JSON documents in workspaces.graph — node values are dynamically
//! shaped, so a document fits better than normalized tables. The jobs table backs
//! generation job tracking and restart recovery.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    /// epoch ms
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub kind: String,
    #[serde(rename = "ref")]
    pub node_ref: String,
    pub x: f64,
    pub y: f64,
    /// Node values — dynamically shaped and owned by the frontend, so passed through as JSON
    pub values: serde_json::Value,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct GraphDoc {
    #[serde(default)]
    pub nodes: Vec<GraphNode>,
    #[serde(default)]
    pub edges: Vec<GraphEdge>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("ws-{nanos:x}")
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

pub struct SqliteStore {
    conn: Connection,
}

impl SqliteStore {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(err)?;
        Self::init(conn)
    }

    /// In-memory DB for tests only
    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(err)?;
        Self::init(conn)
    }

    fn init(conn: Connection) -> Result<Self, String> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS workspaces (
              id         TEXT PRIMARY KEY,
              name       TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              graph      TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}'
            );

            -- Generation job tracking (for resuming after restart)
            CREATE TABLE IF NOT EXISTS jobs (
              id           TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              node_id      TEXT NOT NULL,
              status       TEXT NOT NULL,
              payload      TEXT NOT NULL DEFAULT '{}',
              created_at   INTEGER NOT NULL,
              updated_at   INTEGER NOT NULL
            );
            "#,
        )
        .map_err(err)?;

        // Migration — jobs.media_path (local cache path of the result media)
        let has_media_path: bool = conn
            .prepare("SELECT 1 FROM pragma_table_info('jobs') WHERE name = 'media_path'")
            .and_then(|mut s| s.exists([]))
            .map_err(err)?;
        if !has_media_path {
            conn.execute("ALTER TABLE jobs ADD COLUMN media_path TEXT", [])
                .map_err(err)?;
        }

        // Migration — jobs.provider (multi-provider: routes restart polling recovery)
        let has_provider: bool = conn
            .prepare("SELECT 1 FROM pragma_table_info('jobs') WHERE name = 'provider'")
            .and_then(|mut s| s.exists([]))
            .map_err(err)?;
        if !has_provider {
            conn.execute(
                "ALTER TABLE jobs ADD COLUMN provider TEXT NOT NULL DEFAULT 'higgsfield'",
                [],
            )
            .map_err(err)?;
        }

        Ok(Self { conn })
    }

    /// List ordered by most recently updated
    pub fn list(&self) -> Result<Vec<WorkspaceMeta>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, updated_at FROM workspaces ORDER BY updated_at DESC")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(WorkspaceMeta {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    updated_at: r.get(2)?,
                })
            })
            .map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)
    }

    pub fn create(&self, name: &str) -> Result<WorkspaceMeta, String> {
        let meta = WorkspaceMeta {
            id: new_id(),
            name: name.to_string(),
            updated_at: now_ms(),
        };
        self.conn
            .execute(
                "INSERT INTO workspaces (id, name, updated_at) VALUES (?1, ?2, ?3)",
                params![meta.id, meta.name, meta.updated_at],
            )
            .map_err(err)?;
        Ok(meta)
    }

    pub fn rename(&self, id: &str, name: &str) -> Result<(), String> {
        let n = self
            .conn
            .execute(
                "UPDATE workspaces SET name = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, name, now_ms()],
            )
            .map_err(err)?;
        if n == 0 {
            return Err(format!("No such workspace: {id}"));
        }
        Ok(())
    }

    pub fn duplicate(&self, id: &str) -> Result<WorkspaceMeta, String> {
        let src: Option<(String, String)> = self
            .conn
            .query_row(
                "SELECT name, graph FROM workspaces WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?;
        let (name, graph) = src.ok_or_else(|| format!("No such workspace: {id}"))?;
        let meta = WorkspaceMeta {
            id: new_id(),
            name: format!("{name} (copy)"),
            updated_at: now_ms(),
        };
        self.conn
            .execute(
                "INSERT INTO workspaces (id, name, updated_at, graph) VALUES (?1, ?2, ?3, ?4)",
                params![meta.id, meta.name, meta.updated_at, graph],
            )
            .map_err(err)?;
        Ok(meta)
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        let n = self
            .conn
            .execute("DELETE FROM workspaces WHERE id = ?1", params![id])
            .map_err(err)?;
        if n == 0 {
            return Err(format!("No such workspace: {id}"));
        }
        Ok(())
    }

    pub fn load_graph(&self, id: &str) -> Result<GraphDoc, String> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT graph FROM workspaces WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        let json = json.ok_or_else(|| format!("No such workspace: {id}"))?;
        serde_json::from_str(&json).map_err(err)
    }

    // ── jobs (generation job tracking) ──

    #[allow(clippy::too_many_arguments)]
    pub fn insert_job(
        &self,
        job_id: &str,
        workspace_id: &str,
        node_id: &str,
        status: &str,
        payload: &str,
        provider: &str,
    ) -> Result<(), String> {
        let now = now_ms();
        self.conn
            .execute(
                "INSERT OR REPLACE INTO jobs (id, workspace_id, node_id, status, payload, provider, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                params![job_id, workspace_id, node_id, status, payload, provider, now],
            )
            .map_err(err)?;
        Ok(())
    }

    /// Update status only (payload preserved) — cancellation etc.
    pub fn set_job_status(&self, job_id: &str, status: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE jobs SET status = ?2, updated_at = ?3 WHERE id = ?1",
                params![job_id, status, now_ms()],
            )
            .map_err(err)?;
        Ok(())
    }

    pub fn update_job(&self, job_id: &str, status: &str, payload: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE jobs SET status = ?2, payload = ?3, updated_at = ?4 WHERE id = ?1",
                params![job_id, status, payload, now_ms()],
            )
            .map_err(err)?;
        Ok(())
    }

    /// Job list for a workspace — reconciles results that piled up before load
    /// (job_id, node_id, status, payload, media_path)
    pub fn jobs_for_workspace(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<(String, String, String, String, Option<String>)>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, node_id, status, payload, media_path FROM jobs WHERE workspace_id = ?1",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![workspace_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)
    }

    /// Record the local cache path of the result media
    pub fn set_job_media(&self, job_id: &str, path: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE jobs SET media_path = ?2, updated_at = ?3 WHERE id = ?1",
                params![job_id, path, now_ms()],
            )
            .map_err(err)?;
        Ok(())
    }

    /// Current status of a single job — used by the polling worker for cancellation detection
    /// Owning workspace of a job — used to scope MCP job_wait to the caller
    pub fn job_workspace_of(&self, job_id: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row(
                "SELECT workspace_id FROM jobs WHERE id = ?1",
                params![job_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    pub fn job_status_of(&self, job_id: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row("SELECT status FROM jobs WHERE id = ?1", params![job_id], |r| r.get(0))
            .optional()
            .map_err(err)
    }

    /// Payload, media path, and provider of a single job — used by job_wait and reference enrichment
    pub fn jobs_for_workspace_by_job(
        &self,
        job_id: &str,
    ) -> Result<(String, Option<String>, String), String> {
        self.conn
            .query_row(
                "SELECT payload, media_path, provider FROM jobs WHERE id = ?1",
                params![job_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(err)
    }

    /// List of unfinished jobs — for restart recovery
    /// (job_id, workspace_id, node_id, provider)
    pub fn open_jobs(&self) -> Result<Vec<(String, String, String, String)>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, workspace_id, node_id, provider FROM jobs WHERE status = 'running'")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)
    }

    pub fn save_graph(&self, id: &str, graph: &GraphDoc) -> Result<(), String> {
        let json = serde_json::to_string(graph).map_err(err)?;
        let n = self
            .conn
            .execute(
                "UPDATE workspaces SET graph = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, json, now_ms()],
            )
            .map_err(err)?;
        if n == 0 {
            return Err(format!("No such workspace: {id}"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with_one() -> (SqliteStore, String) {
        let s = SqliteStore::open_in_memory().unwrap();
        let meta = s.create("First space").unwrap();
        (s, meta.id)
    }

    #[test]
    fn create_and_list() {
        let (s, id) = store_with_one();
        let list = s.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, id);
        assert_eq!(list[0].name, "First space");
    }

    #[test]
    fn rename_updates_name() {
        let (s, id) = store_with_one();
        s.rename(&id, "New name").unwrap();
        assert_eq!(s.list().unwrap()[0].name, "New name");
        assert!(s.rename("ghost", "x").is_err());
    }

    #[test]
    fn duplicate_copies_graph() {
        let (s, id) = store_with_one();
        let doc = GraphDoc {
            nodes: vec![GraphNode {
                id: "n1".into(),
                kind: "asset".into(),
                node_ref: "image".into(),
                x: 1.0,
                y: 2.0,
                values: serde_json::json!({"media": null}),
            }],
            edges: vec![],
        };
        s.save_graph(&id, &doc).unwrap();
        let copy = s.duplicate(&id).unwrap();
        assert!(copy.name.ends_with("(copy)"));
        assert_eq!(s.load_graph(&copy.id).unwrap().nodes.len(), 1);
    }

    #[test]
    fn delete_removes() {
        let (s, id) = store_with_one();
        s.delete(&id).unwrap();
        assert!(s.list().unwrap().is_empty());
        assert!(s.delete(&id).is_err());
    }

    #[test]
    fn save_and_load_graph_roundtrip() {
        let (s, id) = store_with_one();
        let doc = GraphDoc {
            nodes: vec![],
            edges: vec![GraphEdge {
                from: "a:__out".into(),
                to: "b:input".into(),
            }],
        };
        s.save_graph(&id, &doc).unwrap();
        let loaded = s.load_graph(&id).unwrap();
        assert_eq!(loaded.edges.len(), 1);
        assert_eq!(loaded.edges[0].from, "a:__out");
        assert!(s.load_graph("ghost").is_err());
    }

    #[test]
    fn jobs_roundtrip() {
        let (s, ws) = store_with_one();
        s.insert_job("j1", &ws, "node1", "running", "{}", "higgsfield").unwrap();
        assert_eq!(
            s.open_jobs().unwrap(),
            vec![("j1".into(), ws.clone(), "node1".into(), "higgsfield".into())]
        );
        s.update_job("j1", "done", "{\"ok\":true}").unwrap();
        assert!(s.open_jobs().unwrap().is_empty());
    }

    #[test]
    fn jobs_provider_routing() {
        // Multi-provider — recovery polling is routed per provider
        let (s, ws) = store_with_one();
        s.insert_job("j1", &ws, "n1", "running", "{}", "magnific").unwrap();
        let open = s.open_jobs().unwrap();
        assert_eq!(open[0].3, "magnific");
    }

    #[test]
    fn job_media_and_status() {
        let (s, ws) = store_with_one();
        s.insert_job("j1", &ws, "node1", "running", "{}", "higgsfield").unwrap();
        assert_eq!(s.job_status_of("j1").unwrap(), Some("running".into()));
        assert_eq!(s.job_status_of("ghost").unwrap(), None);

        s.set_job_status("j1", "canceled").unwrap();
        assert_eq!(s.job_status_of("j1").unwrap(), Some("canceled".into()));

        s.set_job_media("j1", "/tmp/media/j1.png").unwrap();
        let rows = s.jobs_for_workspace(&ws).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].4, Some("/tmp/media/j1.png".into()));
    }

    #[test]
    fn camel_case_serialization() {
        let meta = WorkspaceMeta {
            id: "w".into(),
            name: "n".into(),
            updated_at: 42,
        };
        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("updatedAt"));
    }
}
