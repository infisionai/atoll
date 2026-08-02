---
title: 첫 워크플로
description: Atoll에서 5분 만에 Higgsfield 이미지 워크플로를 만들고 로컬에 캐시된 결과를 확인합니다.
---

# 첫 워크플로

## 목표

약 5분 안에 Higgsfield를 연결하고, 워크스페이스를 만들고, 이미지 모델을 추가하고, 비용 견적을 확인하고, 실행한 다음 결과 노드에서 생성된 이미지를 확인합니다.

## 사전 준비

- 설치되어 실행 중인 Atoll
- 브라우저 기반 OAuth 로그인을 완료할 수 있는 Higgsfield 계정
- 생성에 충분한 Higgsfield 잔액
- Provider 로그인, 카탈로그 로드, 생성을 위한 인터넷 연결

## 단계

1. **Higgsfield를 연결합니다.** 대시보드에서 **Settings**의 톱니바퀴 버튼을 클릭합니다. **Provider Connections**에서 **Higgsfield**를 찾아 **Connect**를 클릭합니다. 브라우저에서 OAuth 로그인을 완료합니다. Atoll로 돌아와 Provider에 **Connected**와 잔액이 표시될 때까지 기다립니다.

2. **워크스페이스를 만듭니다.** 대시보드로 돌아와 **+ New space**를 클릭합니다. Atoll이 워크스페이스를 만들고 캔버스를 엽니다. 대시보드에서 워크스페이스는 **Workspaces** 아래에 표시됩니다.

3. **이미지 모델을 추가합니다.** 왼쪽 **Node library**에서 **Models**를 열고 **Higgsfield** Provider 탭을 선택한 다음 **Image** 필터를 선택합니다. 이미지 모델 카드를 캔버스로 추가합니다. 현재 UI에서는 모델 카드를 클릭하면 노드가 캔버스에 추가되며, 이후 원하는 위치로 노드를 옮길 수 있습니다.

4. **프롬프트를 입력합니다.** 모델 노드에서 `prompt` 필드를 클릭하고 짧은 설명을 입력합니다. 예: `A lighthouse at dusk, calm ocean, cinematic light`

5. **견적을 확인합니다.** 노드의 `$` 배지를 클릭합니다. Atoll이 실행 전 견적을 요청하고 반환된 금액을 크레딧으로 표시합니다. 견적은 사전 확인 절차이며 생성을 제출하지 않습니다. 필수 입력이 누락되었다면 견적을 요청하기 전에 입력을 완료합니다.

6. **노드를 실행합니다.** 모델 노드를 선택하고 떠 있는 노드 툴바에서 **Run**을 클릭합니다.

   ::: warning
   Provider 크레딧이 소모됩니다.
   :::

   Atoll이 대기 중인 결과 노드를 만들고 생성 노드를 **Running** 상태로 변경한 다음, 작업이 완료될 때까지 Provider 작업을 추적합니다.

7. **결과를 기다립니다.** 작업이 완료되면 대기 중인 결과 노드가 생성된 미디어가 있는 결과 노드로 바뀝니다. 이미지 워크플로의 경우 노드에 이미지가 표시되고 Atoll이 사본을 로컬 미디어 캐시에 다운로드합니다.

## 확인

아래가 모두 확인되면 성공입니다.

- 결과 노드에 생성된 이미지가 표시됩니다.
- 생성 노드가 더 이상 **Running** 상태가 아닙니다.
- macOS에서는 Atoll의 미디어 캐시 `~/Library/Application Support/infision.atoll/media/` 아래에 로컬 사본이 있습니다. 다른 플랫폼에서는 이에 해당하는 앱 데이터 디렉터리를 사용합니다.

## 문제 해결

### `$` 배지에서 견적이 반환되지 않는 경우

일부 Provider는 실행 전 견적 도구를 제공하지 않습니다. 특히 Kling은 견적을 지원하지 않으므로 `$` 배지를 사용하지 못할 수 있습니다. Provider별 자세한 내용은 [Kling](/ko/providers/kling)을 참고하세요.

### Magnific에서 Premium 플랜을 요청하는 경우

Magnific MCP를 사용하려면 Premium 플랜이 필요할 수 있습니다. 연결 방법과 플랜 요구 사항은 [Magnific](/ko/providers/magnific)을 참고하세요.

### Run을 사용할 수 없거나 노드에 오류가 표시되는 경우

모델 노드에 `prompt`를 비롯한 모든 필수 필드가 입력되어 있고 해당 Provider가 연결되어 있는지 확인합니다. Atoll이 모델 입력을 검증하고 제출할 수 있을 때만 결과 노드가 만들어집니다.

### 결과가 계속 실행 중인 경우

Provider 작업이 추적되는 동안 워크스페이스를 열어 두세요. 앱이 재시작됐다면 워크스페이스를 다시 여는 시점에 Atoll이 저장된 작업 상태를 다시 동기화합니다.

## 다음 단계

- [Higgsfield Provider 가이드](/ko/providers/higgsfield)를 읽습니다.
- [Magnific](/ko/providers/magnific) 또는 [Kling](/ko/providers/kling)을 사용해 다른 Provider 워크플로를 시도합니다.
- Atoll의 [캔버스](/ko/concepts/) 구성을 알아봅니다.
