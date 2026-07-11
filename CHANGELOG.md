# Changelog

## [0.2.0](https://github.com/ahedderich/fluidSender/compare/v0.1.3...v0.2.0) (2026-07-11)


### Features

* bugfixes and security hardening ([73cb57c](https://github.com/ahedderich/fluidSender/commit/73cb57c9c22729e31e0153067e138c3444541a40))
* **dialogs:** show tool library info in toolchange dialog, promote O… ([35b6253](https://github.com/ahedderich/fluidSender/commit/35b6253530c23a9f70ceea8dd3f5c93bbc14ba32))
* **dialogs:** show tool library info in toolchange dialog, promote OK in probe result ([1ac0740](https://github.com/ahedderich/fluidSender/commit/1ac07403450c68fb898f2c0547f2cc63e6a0c6ab))
* **job-panel:** split sent/exec rows and add measured time ([598a863](https://github.com/ahedderich/fluidSender/commit/598a863fe8b449b79e02c5bc598d55a8683e3166))
* run dev containers as non-root ([b326735](https://github.com/ahedderich/fluidSender/commit/b326735e7439bca6255ccd7cd10991f03a8ae53b))
* **ui:** harden container image with distroless nonroot base ([92c613c](https://github.com/ahedderich/fluidSender/commit/92c613c94d92da588333132f674bd3e5d7445b29))


### Bug Fixes

* harden dev containers ([1ac5853](https://github.com/ahedderich/fluidSender/commit/1ac5853b55096fedecaaf0dfcfde912c5b1c0879))
* job panel meas time ([91322ba](https://github.com/ahedderich/fluidSender/commit/91322ba9d1388d65e3f2311f084b8bd8e60549b8))
* **job:** track active runtime accurately, show live timer, smooth an… ([adec094](https://github.com/ahedderich/fluidSender/commit/adec0949ba7c8715c6ae6c2de6ced5fe39c1a7e1))
* **job:** track active runtime accurately, show live timer, smooth analysis progress ([c43d31a](https://github.com/ahedderich/fluidSender/commit/c43d31a314d5385cbbca8c65b7aef6796972273f))
* **ui:** correct feedrate unit and merge toolchange tool info with to… ([564184a](https://github.com/ahedderich/fluidSender/commit/564184a5260331105003d50628d60fa905b4e3f3))
* **ui:** correct feedrate unit and merge toolchange tool info with tool number ([87e9d08](https://github.com/ahedderich/fluidSender/commit/87e9d08129013845dd3be16ce515022089a73b6c))
* **ui:** harden container image with distroless nonroot base ([b78a3c2](https://github.com/ahedderich/fluidSender/commit/b78a3c23ba4ba26a4659b89047734794c36967f0))
* **ui:** move distroless base to debian13 to clear libssl3 CVEs ([a8f9ae9](https://github.com/ahedderich/fluidSender/commit/a8f9ae9446c780066b79fb72a30d3de57dd34094))
* **ui:** move distroless base to debian13 to clear libssl3 CVEs ([a1c206f](https://github.com/ahedderich/fluidSender/commit/a1c206f302da25593f61249c587d872437ab921e))
* **ui:** poll status faster while a job is actively sending ([0e4353d](https://github.com/ahedderich/fluidSender/commit/0e4353df703bc990a5b3d61d48347951d03142bd))
* **ui:** poll status faster while a job is actively sending ([86ae101](https://github.com/ahedderich/fluidSender/commit/86ae101d64d5cd4e99f72c6b64bcf3c4c25d3d25))
* **ui:** replace unmaintained expr-eval with expr-eval-fork ([0c69a33](https://github.com/ahedderich/fluidSender/commit/0c69a339c50905908dca0efc0df8af894877ff16))
* **viewport:** stop canvas intrinsic aspect ratio from resizing the container ([5897024](https://github.com/ahedderich/fluidSender/commit/5897024a1de4bffa7bd86ed2d4974765f5e58ec9))
* **webcam:** reconnect stream fresh after tab is backgrounded ([f293672](https://github.com/ahedderich/fluidSender/commit/f293672addeda0e4cbac4af6b7d0f25a9cfd8705))


### Performance Improvements

* **sync:** coalesce machine/job state updates to latest on the client ([79074bf](https://github.com/ahedderich/fluidSender/commit/79074bffc4566d3363fcba5e1b708aeccd7b6930))
* **viewport:** debounce resize recalculation by 300ms ([6cba111](https://github.com/ahedderich/fluidSender/commit/6cba1119fc1238c07dc76df77ddfe913b35e69f5))

## [0.1.3](https://github.com/ahedderich/fluidSender/compare/v0.1.2...v0.1.3) (2026-07-10)


### Bug Fixes

* updated security.md and unfixabled vulerability definition ([c5f73c3](https://github.com/ahedderich/fluidSender/commit/c5f73c3c5865fa87f7c3b1faf104c1cfd4ce1223))

## [0.1.2](https://github.com/ahedderich/fluidSender/compare/v0.1.1...v0.1.2) (2026-07-10)


### Bug Fixes

* release please github app integration ([3e5ce1f](https://github.com/ahedderich/fluidSender/commit/3e5ce1f196153a9ca320cc43b35e32f6bf2685f9))

## [0.1.1](https://github.com/ahedderich/fluidSender/compare/v0.1.0...v0.1.1) (2026-07-10)


### Features

* inital pre release ([#17](https://github.com/ahedderich/fluidSender/issues/17)) ([d0205b9](https://github.com/ahedderich/fluidSender/commit/d0205b96ed4d302008873c3298b4470d472fe280))
* initial pre release ([#14](https://github.com/ahedderich/fluidSender/issues/14)) ([2bb6f54](https://github.com/ahedderich/fluidSender/commit/2bb6f5404eddb8e6b4d4224af175a9b48e345ec2))


### Bug Fixes

* commit history and commentless release please version tagging ([1af46e2](https://github.com/ahedderich/fluidSender/commit/1af46e2bbd06190189686d3adf1303ab64d1dc07))
* Drop component prefix from release-please tag names ([c7ef6ba](https://github.com/ahedderich/fluidSender/commit/c7ef6baadae0350ccb03e28d2560626e2eb11dde))

## 0.1.0 (2026-07-10)


### Features

* inital pre release ([#17](https://github.com/ahedderich/fluidSender/issues/17)) ([d0205b9](https://github.com/ahedderich/fluidSender/commit/d0205b96ed4d302008873c3298b4470d472fe280))
* initial pre release ([#14](https://github.com/ahedderich/fluidSender/issues/14)) ([2bb6f54](https://github.com/ahedderich/fluidSender/commit/2bb6f5404eddb8e6b4d4224af175a9b48e345ec2))

## Changelog

All notable changes to this project will be documented in this file.

<!-- This file is automatically maintained by release-please. Do not edit manually. -->
