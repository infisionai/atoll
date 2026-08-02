---
title: Windows에 설치하기
description: 공식 GitHub Release에서 Atoll Windows 설치 프로그램을 다운로드하여 설치합니다.
---

# Windows에 설치하기

::: info 아직 공개 릴리스가 없습니다
첫 공개 릴리스는 아직 출시 전입니다. 아래 단계는 [Releases 페이지](https://github.com/infisionai/atoll/releases)에 첫 릴리스가 올라오는 시점부터 적용되며, 그 전에는 소스에서 직접 실행하는 방법만 사용할 수 있습니다.
:::

## 설치 결과

공식 GitHub Releases 페이지에서 Atoll을 설치하고 Windows에서 대시보드를 엽니다.

GitHub Releases는 Atoll의 유일한 공식 배포 채널입니다:
<https://github.com/infisionai/atoll/releases>.

## 사전 준비

- Windows 컴퓨터
- 설치 프로그램을 실행할 수 있는 권한
- 아래 Windows OAuth 제한이 적용되지 않을 때 Provider에 로그인할 브라우저

## 단계

1. [최신 Atoll 릴리스](https://github.com/infisionai/atoll/releases)를 엽니다.

2. 릴리스 에셋에서 Windows 설치 프로그램을 선택합니다. `.exe` NSIS 설치 프로그램이나 `.msi` 패키지 중 하나를 선택할 수 있습니다. 파일 이름이 Atoll 릴리스 버전과 일치하는 에셋을 선택합니다.

3. 설치 프로그램을 열고 안내에 따릅니다. Windows 보안 경고를 승인하기 전에 파일 출처를 확인할 수 있도록 공식 GitHub 릴리스 페이지에서 받은 설치 프로그램을 사용합니다.

4. 서명되지 않은 설치 프로그램에 대해 Microsoft Defender SmartScreen 경고가 표시되면 **More info**를 선택하고 앱과 출처를 확인한 다음 **Run anyway**를 선택합니다.

   Windows 11 Smart App Control은 별도의 제어 기능입니다. 개별적으로 **Run anyway**를 선택하는 방법 없이 서명되지 않은 앱을 차단할 수 있습니다. Atoll을 설치하기 위해 Smart App Control이나 시스템 전체의 다른 보안 보호 기능을 비활성화하지 마세요. 조직 정책에서 허용하는 설치 프로그램을 사용하거나 서명된 빌드가 나올 때까지 기다립니다.

### Atoll 제거

앱을 제거하려면 **Settings > Apps > Installed apps**를 열고 **Atoll**을 찾은 다음 메뉴를 열어 **Uninstall**을 선택합니다. MSI로 설치한 경우 **Control Panel > Programs and Features**에서도 제거할 수 있습니다.

## 확인

Atoll이 열리고 대시보드에 **Workspaces**가 표시되면 설치가 완료된 것입니다. 대시보드가 보인다는 것은 앱이 설치되었다는 뜻이며, Windows에서 Provider OAuth가 작동한다는 뜻은 아닙니다.

## 문제 해결

### SmartScreen에서 계속 설치 프로그램을 차단하는 경우

설치 프로그램이 공식 [GitHub Releases 페이지](https://github.com/infisionai/atoll/releases)에서 받은 것인지 확인합니다. 표준 SmartScreen 프롬프트가 표시되면 출처를 확인한 후에만 **More info → Run anyway**를 사용합니다. Smart App Control에서는 개별 우회 방법을 제공하지 않을 수 있으므로 시스템 보안 보호 기능을 끄지 마세요.

### Atoll은 데이터를 어디에 저장하나요?

Atoll의 애플리케이션 데이터는 `%APPDATA%\infision.atoll\` 아래에 저장됩니다. Provider 인증 정보는 JSON 파일로 로컬에 저장되며(Unix에서는 파일 모드 0600), 앱 데이터 디렉터리에 있습니다. 생성된 미디어는 해당 디렉터리 아래 앱의 로컬 `media` 캐시에 보관됩니다.

## 알려진 제한 사항

Windows에서 Provider OAuth 연결은 아직 검증되지 않았습니다. 현재 연결 구현은 OAuth 브라우저 플로를 시작할 때 macOS의 `open` 명령을 호출하므로, **Settings > Provider Connections > Connect**가 Windows에서 완료된다고 가정하지 마세요. Windows 설치 프로그램으로 대시보드를 열 수는 있지만, Windows에서 Provider가 연결된 워크플로는 아직 검증되지 않았습니다.

에이전트 터미널도 아직 Windows에서 동작하지 않습니다. Atoll은 에이전트 CLI를 Unix 로그인 셸(`$SHELL -l -c`, 폴백 `/bin/zsh`)로 실행하는데, 일반적인 Windows 환경에는 이 셸이 없습니다.

## 다음 단계

Provider 연결 환경이 지원되는 경우 [첫 워크플로](/ko/getting-started/first-workflow)를 계속 진행합니다. Windows에서 Provider OAuth를 사용하려면 이 경로에 의존하기 전에 위의 제한 사항을 확인하세요.
