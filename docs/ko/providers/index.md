---
title: 공급자 개요
description: Atoll의 Higgsfield, Magnific, Kling 공급자 연결을 비교합니다.
---

# 공급자 개요

Atoll은 각 공급자의 MCP 서비스를 통해 Higgsfield, Magnific, Kling에 연결합니다. Settings에서 공급자를 연결한 후 모델 라이브러리에서 선택합니다. 공급자마다 계정, 세션, 카탈로그, 잔액, 크레딧 규칙이 서로 다릅니다.

## 공급자 비교

| 공급자 | 출력 유형 | 비용 견적 | 미디어 입력 | 계정 요구 사항 | 잔액 | 확인 시점 |
| --- | --- | --- | --- | --- | --- | --- |
| Higgsfield | 이미지와 동영상을 포함해, 노출된 실시간 카탈로그 정의 유형 | 지원되는 생성 종류에 대해 지원 (`$`) | Higgsfield 미디어 ID/UUID; 공급자 간 결과는 미디어 URL에서 가져옴 | OAuth를 통한 Higgsfield 계정 | Settings와 캔버스 잔액 칩에 표시 | 마지막 확인: 2026-08 |
| Magnific | 이미지와 동영상 | 지원 (`$`); Auto 계열 모델은 카탈로그에서 제외 | 이미지 생성 식별자; 동영상은 URL 또는 생성 식별자로 된 시작 프레임 하나 사용 | MCP 사용에 Magnific Premium 플랜 필요 | 계정이 `account_balance`에 응답할 수 있을 때 표시; Premium 액세스 필요 | 마지막 확인: 2026-08 |
| Kling | 이미지와 동영상 | 제공되지 않음; `$` 견적 없음 | 공급자가 액세스할 수 있는 HTTPS 미디어 URL만 지원 (`inputType: URL`) | OAuth를 통한 Kling 계정 | 멤버십/크레딧 데이터에서 남은 크레딧을 파싱해 표시 | 마지막 확인: 2026-08 |

앱의 실시간 카탈로그가 모델 사용 가능 여부, 매개변수, 지원되는 미디어 포트, 계정별 Kling 모델의 기준입니다. 모델 이름은 이 문서에 일부러 옮기지 않았습니다.

::: warning
공급자 크레딧이 소모됩니다. 카탈로그 조회, 잔액 새로 고침, 지원되는 실행 전 견적은 생성 작업을 제출하지 않습니다. Kling에는 견적 작업이 없습니다.
:::

## 공통 연결 동작

### 브라우저 로그인

세 공급자 모두 PKCE를 사용하는 OAuth를 지원합니다. Settings에서 **Connect**를 선택하면 Atoll이 기본 브라우저에서 공급자의 로그인 페이지를 열고, 로컬 콜백을 기다린 후 인증이 완료되면 앱으로 돌아옵니다.

공급자 계정은 서로 독립적입니다. 한 공급자를 연결하거나 연결 해제해도 다른 공급자의 자격 증명을 연결, 연결 해제 또는 교체하지 않습니다.

자격 증명은 JSON 파일로 로컬에 저장됩니다(Unix에서는 파일 모드 0600). 앱 데이터 디렉터리는 다음과 같습니다.

- macOS: `~/Library/Application Support/infision.atoll/`
- Windows: `%APPDATA%\\infision.atoll\\`

::: warning
Windows에서 공급자 OAuth 연결은 검증되지 않았습니다. 현재 연결 계층은 브라우저를 실행할 때 macOS의 `open` 명령을 호출합니다.
:::

### 공급자 연결 해제

1. **Settings → Provider Connections**를 엽니다.
2. 연결된 공급자를 찾습니다.
3. **Disconnect**를 선택합니다.

연결을 해제하면 해당 공급자의 로컬 자격 증명 파일을 삭제하고, 캐시된 잔액을 지우며, MCP 세션을 초기화합니다. 다른 공급자에는 영향을 주지 않습니다. 해당 공급자를 다시 사용하려면 **Connect**를 선택하고 OAuth를 다시 완료합니다.

## 문제 해결

공급자에 연결할 수 없거나 잔액이 표시되지 않거나 세션이 만료된 경우 [문제 해결](/ko/help/troubleshooting)을 참고하세요.

## 다음 단계

- [Higgsfield 연결](/ko/providers/higgsfield)
- [Magnific 연결](/ko/providers/magnific)
- [Kling 연결](/ko/providers/kling)
