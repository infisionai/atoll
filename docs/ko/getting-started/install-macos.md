---
title: macOS에 설치하기
description: 공식 GitHub Release에서 서명되지 않은 Atoll macOS 앱을 다운로드하여 설치합니다.
---

# macOS에 설치하기

::: info 아직 공개 릴리스가 없습니다
첫 공개 릴리스는 아직 출시 전입니다. 아래 단계는 [Releases 페이지](https://github.com/infisionai/atoll/releases)에 첫 릴리스가 올라오는 시점부터 적용되며, 그 전에는 소스에서 직접 실행하는 방법만 사용할 수 있습니다.
:::

## 설치 결과

공식 GitHub Releases 페이지에서 Atoll을 설치하고 Mac에서 대시보드를 엽니다.

GitHub Releases는 Atoll의 유일한 공식 배포 채널입니다:
<https://github.com/infisionai/atoll/releases>.

## 사전 요구 사항

- Apple Silicon 또는 Intel 프로세서가 탑재된 Mac
- 애플리케이션을 `/Applications`에 복사할 수 있는 권한
- 설치 후 Provider에 로그인할 브라우저

## 단계

1. [최신 Atoll 릴리스](https://github.com/infisionai/atoll/releases)를 엽니다.

2. Mac의 칩에 맞는 `.dmg`를 선택합니다.

   - Apple Silicon: `aarch64`로 표시된 에셋을 선택합니다.
   - Intel: `x64`로 표시된 에셋을 선택합니다.

   릴리스 워크플로는 Apple Silicon 대상인 `aarch64-apple-darwin`과 Intel 대상인 `x86_64-apple-darwin`을 빌드합니다. 릴리스 에셋 이름은 Atoll 제품명과 릴리스 버전을 따르므로, 정확한 파일 이름이 바뀌더라도 사용 중인 칩에 맞는 `.dmg`를 선택하면 됩니다.

3. 다운로드한 `.dmg`를 엽니다.

4. `Atoll.app`을 마운트된 디스크 이미지의 `Applications` 바로 가기로 드래그합니다.

5. 현재 Atoll은 서명·공증되지 않은 빌드라서, 최신 macOS는 다운로드한 앱을 **"손상되었기 때문에 열 수 없습니다"** 라고 표시하며 열어주지 않습니다. 파일이 실제로 손상된 것이 아니라 미공증 앱에 붙는 Gatekeeper 격리 플래그 때문입니다. 공식 GitHub Releases 페이지에서 받았는지 먼저 확인한 뒤, 터미널에서 플래그를 제거합니다.

   ```bash
   xattr -cr /Applications/Atoll.app
   ```

   구버전 macOS에서는 이 명령 없이 `Atoll.app`을 Control-클릭 → **Open** → **Open**, 또는 **System Settings > Privacy & Security > Open Anyway**만으로 열릴 수도 있습니다.

## 확인

Atoll이 열리고 대시보드에 **Workspaces**가 표시되면 설치가 완료된 것입니다.

## 문제 해결

### macOS에서 "손상되었습니다"라며 열리지 않는 경우

경고가 표시되었다고 해서 앱을 신뢰할 수 있다는 뜻으로 받아들이지 마세요. 먼저 공식 [GitHub Releases 페이지](https://github.com/infisionai/atoll/releases)에서 받은 것인지 확인한 다음, 위의 `xattr -cr /Applications/Atoll.app` 명령을 실행합니다. 최신 macOS에서는 미공증 앱에 대해 **right-click → Open**이 더 이상 통하지 않으므로 이 명령이 사실상 필수입니다.

### 앱은 열리지만 모델 라이브러리가 비어 있는 경우

대시보드에서 **Settings**를 열고 Provider를 연결합니다. Provider 인증 정보는 JSON 파일로 로컬에 저장되며(Unix에서는 파일 모드 0600), 위치는 `~/Library/Application Support/infision.atoll/`입니다.

### 잘못된 빌드를 다운로드한 경우

Apple Silicon Mac에는 `aarch64` 에셋이 필요합니다. Intel Mac에는 `x64` 에셋이 필요합니다. 공식 릴리스 페이지로 돌아가 사용 중인 칩에 맞는 `.dmg`를 다운로드합니다.

## 다음 단계

[첫 워크플로](/ko/getting-started/first-workflow)를 계속 진행합니다.
