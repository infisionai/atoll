---
title: Higgsfield 연결
description: Higgsfield를 Atoll에 연결하고 실시간 카탈로그, 잔액, 비용 견적을 사용합니다.
---

# Higgsfield 연결

Higgsfield 계정을 연결하면 실시간 모델 카탈로그를 탐색하고, Provider 잔액을 확인하고, 선택한 생성 종류가 지원하는 경우 실행 전 `$` 견적을 요청할 수 있습니다.

## 결과

설정을 마치면 Atoll에서 Higgsfield를 독립적인 Provider로 사용할 수 있습니다. 실시간 카탈로그를 불러와 캐시하고, 잔액을 확인하며, 지원되는 생성 노드에 실행 전 `$` 견적을 표시할 수 있습니다.

## 사전 준비

- MCP 연결을 승인할 수 있는 Higgsfield 계정
- 검증된 브라우저 실행 흐름을 위해 macOS에서 실행 중인 Atoll

::: warning
Windows에서 Provider OAuth 연결은 검증되지 않았습니다. 현재 연결 계층은 브라우저를 실행할 때 macOS의 `open` 명령을 호출합니다.
:::

## 단계

1. **Settings → Provider Connections**를 엽니다.
2. **Higgsfield**를 찾아 **Connect**를 선택합니다.
3. 브라우저에서 로그인 및 동의 절차를 완료합니다.
4. 브라우저에 로그인이 완료되었다는 메시지가 표시되면 Atoll로 돌아옵니다.

OAuth 흐름은 PKCE와 로컬 콜백을 사용합니다. 브라우저가 열리지 않으면 인증 URL이 로그에 기록되므로, 검증된 플랫폼에서 URL을 직접 열 수 있습니다.

::: warning
Provider 크레딧이 소모됩니다. 제출하기 전에 선택한 모델 또는 생성 종류에 표시된 실행 전 `$` 견적을 확인하세요. 견적을 사용할 수 있는 경우에만 표시됩니다.
:::

## 확인

연결에 성공하면 다음을 확인할 수 있습니다.

- Provider Connections에 Higgsfield가 인증된 계정 정보와 함께 **Connected**로 표시됩니다(정보를 사용할 수 있는 경우).
- Atoll은 `models_explore`를 통해 Higgsfield의 실시간 모델 카탈로그를 불러와 나중에 사용할 수 있도록 캐시합니다. 모델 이름과 매개변수의 기준은 이 페이지가 아니라 카탈로그입니다.
- 잔액은 Settings와 캔버스 잔액 칩에 크레딧 값으로 표시됩니다. Higgsfield의 `balance` 작업을 다시 조회하려면 **Refresh balance**를 사용하세요.
- 지원되는 생성 노드에는 `$` 견적이 표시될 수 있습니다. 견적은 사전 확인 절차이며 작업을 제출하지 않습니다.

## 다른 Provider의 미디어 연결

Higgsfield는 같은 Provider 또는 다른 Provider가 만든 결과를 받을 수 있습니다.

- Higgsfield 결과는 Higgsfield 작업 UUID를 미디어 값으로 유지합니다.
- 다른 Provider의 결과에는 원격 미디어 URL이 포함됩니다. 제출하기 전에 Atoll은 Higgsfield의 `media_import_url` 작업을 통해 Provider 간 참조를 확인한 다음, 반환된 Higgsfield 미디어 ID를 사용합니다.

이는 URL 기반 미디어 가져오기입니다. 원본 Provider의 내부 미디어 ID를 Higgsfield ID인 것처럼 전송하지 않습니다.

## 문제 해결

### 연결에 실패합니다

다른 Provider 연결이 진행 중이 아닌지 확인한 다음 다시 시도하세요. Provider들은 로컬 콜백 포트 `17872`를 공유하므로, 첫 번째 연결이 브라우저 콜백을 기다리는 동안 두 번째 연결을 동시에 시도하면 실패할 수 있습니다.

### 잔액이 표시되지 않습니다

Settings에서 **Refresh balance**를 선택하세요. 연결된 Provider에서 잔액이 누락되면 한 번 자동으로 새로 고칩니다. 조회에 실패하면 알림으로 표시되며, 수동 새로 고침은 계속 사용할 수 있습니다.

### 세션이 만료되었습니다

만료된 Provider 카드에서 **Reconnect**를 선택하고 브라우저 로그인을 다시 완료하세요. 새로 고침 토큰 갱신에 실패하면 Atoll에서 새로운 OAuth 로그인을 요구합니다.

연결, 자격 증명, 콜백을 전반적으로 확인하려면 [문제 해결](/ko/help/troubleshooting)을 참고하세요.

## 다음 단계

- [Provider 개요](/ko/providers/)
- [Magnific 연결](/ko/providers/magnific)
- [Kling 연결](/ko/providers/kling)
