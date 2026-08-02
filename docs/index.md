---
layout: home

hero:
  name: atoll
  text: Your AI generation stack, wired on one canvas.
  tagline: Connect Higgsfield, Magnific, and Kling with your own accounts. Chain results across providers, keep media local, and let Claude Code or Codex work directly on the graph.
  image:
    src: /images/canvas.png
    alt: Atoll canvas with a node graph and the agent terminal open
  actions:
    - theme: brand
      text: Download Atoll
      link: https://github.com/infisionai/atoll/releases/latest
    - theme: alt
      text: Build your first workflow
      link: /getting-started/first-workflow
    - theme: alt
      text: View on GitHub
      link: https://github.com/infisionai/atoll

features:
  - title: One typed canvas
    details: Image, video, audio, and 3D flow through typed ports. Connections only land where the types agree — the graph stays valid by construction.
  - title: Cross-provider workflows
    details: Generate an image on Magnific, animate it on Higgsfield. Results from one provider plug straight into the next node.
  - title: Know before you run
    details: Provider balances in the header, a cost estimate on the node. See what a run costs before you spend credits.
  - title: Results survive the tab
    details: Workspaces, jobs, and media persist in local SQLite and a media cache. Close the app mid-run — tracking resumes on restart.
  - title: An agent inside the instrument
    details: Claude Code or Codex runs in a built-in terminal and reads and edits the same canvas over MCP. Ask for a workflow in plain language.
---

<p class="trust-strip">Local-first · Your accounts · MIT licensed · Unsigned preview builds</p>

<style scoped>
.trust-strip {
  margin-top: 8px;
  text-align: center;
  font-size: 13px;
  color: var(--vp-c-text-3);
}
</style>
