---
title: Magnific 연결
description: Premium MCP 액세스로 Magnific을 Atoll에 연결하고 이미지 또는 단일 클립 동영상을 생성합니다.
---

# Magnific 연결

Magnific은 Atoll에서 이미지와 동영상 생성을 담당합니다. MCP 연결에는 Premium 플랜이 필요하고, 사용 가능한 모델과 매개변수는 실시간 카탈로그가 알려 줍니다.

## 목표

설정을 마치면 Premium MCP 연결을 통해 Magnific에서 이미지와 단일 클립 동영상을 생성할 수 있습니다. 앱에서 계정 잔액을 새로 고치고, 실행 전 견적을 지원하는 모델에 견적을 표시할 수 있습니다.

## 사전 준비

::: warning
Magnific MCP를 사용하려면 **로그인하기 전에 Premium 플랜이 필요합니다**. 연결 직전에 플랜을 구매하거나 업그레이드하면 권한 정보가 전파되는 데 시간이 걸릴 수 있습니다. 잠시 기다린 다음 연결 또는 잔액 새로 고침을 다시 시도하세요.
:::

- Premium MCP 액세스 권한이 있는 Magnific 계정
- 검증된 브라우저 실행 흐름을 위해 macOS에서 실행 중인 Atoll

::: warning
Windows에서 Provider OAuth 연결은 검증되지 않았습니다. 현재 연결 계층은 브라우저를 실행할 때 macOS의 `open` 명령을 호출합니다.
:::

## 단계

1. Magnific Premium 플랜이 활성 상태인지 확인합니다.
2. **Settings → Provider Connections**를 엽니다.
3. **Magnific**을 찾아 **Connect**를 선택합니다.
4. 브라우저에서 로그인 및 동의 절차를 완료합니다.
5. 브라우저에 로그인이 완료되었다는 메시지가 표시되면 Atoll로 돌아옵니다.

연결은 PKCE와 로컬 콜백을 사용하는 OAuth로 진행됩니다. Magnific 계정은 Higgsfield 및 Kling 계정과 독립적입니다.

::: warning
Provider 크레딧이 소모됩니다. 선택한 모델이 지원하는 경우 제출하기 전에 제공되는 실행 전 견적을 확인하세요.
:::

## 확인

연결한 후 다음을 확인할 수 있습니다.

- Provider Connections에 Magnific이 인증된 계정 정보와 함께 **Connected**로 표시됩니다(정보를 사용할 수 있는 경우).
- Atoll은 `images_models_list`와 `video_models_list`에서 실시간 카탈로그를 불러와 캐시합니다. 모델 이름은 이 페이지에 옮기지 않았으며, 실시간 카탈로그가 기준입니다.
- 잔액은 Magnific의 `account_balance` 작업을 통해 조회되며, 계정에서 제공할 수 있을 때 Settings와 캔버스 잔액 칩에 표시됩니다.
- 이미지 모델은 참조에 이미지 생성 식별자를 사용합니다.
- 동영상 생성은 클립 하나로 `video_generate`에 직접 전송됩니다. Atoll은 여러 클립을 사용하는 `video_plan` 경로를 사용하지 않습니다.
- 동영상 시작 프레임은 에셋 URL 또는 생성 식별자로 나타낼 수 있습니다. Provider 간 결과는 원격 URL로 전달됩니다.
- 서버가 실행 시점에 실행 모델을 고르는 Auto 계열 항목은 Atoll 카탈로그에서 제외됩니다. 카탈로그에 표시되는 모든 Magnific 모델은 실행 전 `$` 견적을 지원합니다.

## 문제 해결

### 로그인 또는 잔액 조회가 거부되는 경우

Premium MCP 액세스가 활성 상태인지 확인하세요. 새로 구매하거나 업그레이드한 후에는 플랜 변경 사항이 전파될 때까지 기다렸다가 다시 시도하세요. Premium 전용 잔액 작업이 플랜 제한을 반환하는 동안에도 Atoll에는 연결 상태가 표시될 수 있습니다.

### 연결이 만료된 경우

Magnific Provider 카드에서 **Reconnect**를 선택하고 OAuth를 다시 완료하세요. 토큰 갱신 실패는 세션 만료로 표시되며 새 로그인이 필요합니다.

### 잔액이 표시되지 않는 경우

**Refresh balance**를 선택하세요. 계정이 Premium이 아니면 플랜을 업그레이드하고 변경 사항이 전파될 때까지 잔액 조회를 사용할 수 없을 수 있습니다.

연결, 인증 정보, 콜백을 전반적으로 확인하려면 [문제 해결](/ko/help/troubleshooting)을 참고하세요.

## 다음 단계

- [Provider 개요](/ko/providers/)
- [Higgsfield 연결](/ko/providers/higgsfield)
- [Kling 연결](/ko/providers/kling)
