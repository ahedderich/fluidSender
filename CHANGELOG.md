# Changelog

## [0.3.0](https://github.com/ahedderich/fluidSender/compare/v0.3.0...v0.3.0) (2026-07-27)


### Features

* **api:** add external file upload API for third-party tools ([8982bc7](https://github.com/ahedderich/fluidSender/commit/8982bc7701e72956f8052ee0b17b9c8a1697922d))
* **api:** add external file upload API for third-party tools ([d9dfd4f](https://github.com/ahedderich/fluidSender/commit/d9dfd4fa8ca0236c15e9890c8631e379294ef2af)), closes [#63](https://github.com/ahedderich/fluidSender/issues/63)
* bugfixes and security hardening ([73cb57c](https://github.com/ahedderich/fluidSender/commit/73cb57c9c22729e31e0153067e138c3444541a40))
* **desktop:** add Electron desktop app with network settings and CI … ([d537e16](https://github.com/ahedderich/fluidSender/commit/d537e167fd0ef95b6f7ff3a45ce9131684f7f2c9))
* **desktop:** add Electron desktop app with network settings and CI builds ([8348ac0](https://github.com/ahedderich/fluidSender/commit/8348ac0eac8a516867b5f5d946a4074364534d31))
* **dialogs:** show tool library info in toolchange dialog, promote O… ([35b6253](https://github.com/ahedderich/fluidSender/commit/35b6253530c23a9f70ceea8dd3f5c93bbc14ba32))
* **dialogs:** show tool library info in toolchange dialog, promote OK in probe result ([1ac0740](https://github.com/ahedderich/fluidSender/commit/1ac07403450c68fb898f2c0547f2cc63e6a0c6ab))
* **gcode:** detect CAM generator and extract per-generator tool info ([729ab0e](https://github.com/ahedderich/fluidSender/commit/729ab0e070941321cc9af0fe3d2180a06f9f3650)), closes [#64](https://github.com/ahedderich/fluidSender/issues/64)
* **gcode:** model acceleration and cornering deceleration in time estimates ([5aecf8c](https://github.com/ahedderich/fluidSender/commit/5aecf8ca28087eb8536a6b89afe44e5accfc5bfd)), closes [#46](https://github.com/ahedderich/fluidSender/issues/46)
* inital pre release ([#17](https://github.com/ahedderich/fluidSender/issues/17)) ([d0205b9](https://github.com/ahedderich/fluidSender/commit/d0205b96ed4d302008873c3298b4470d472fe280))
* initial pre release ([#14](https://github.com/ahedderich/fluidSender/issues/14)) ([2bb6f54](https://github.com/ahedderich/fluidSender/commit/2bb6f5404eddb8e6b4d4224af175a9b48e345ec2))
* **job-panel:** split sent/exec rows and add measured time ([598a863](https://github.com/ahedderich/fluidSender/commit/598a863fe8b449b79e02c5bc598d55a8683e3166))
* many small fixes and desktop app version ([7e4bca6](https://github.com/ahedderich/fluidSender/commit/7e4bca6e8391e4c893ff9ed68761db5cf722d8cd))
* run dev containers as non-root ([b326735](https://github.com/ahedderich/fluidSender/commit/b326735e7439bca6255ccd7cd10991f03a8ae53b))
* **sim:** report live config.yaml and make firmware version testable ([9325cb1](https://github.com/ahedderich/fluidSender/commit/9325cb110ebec6c9835bac8d8b0bd40a980e2ebb))
* **sim:** track and report tool number for atc-passthrough testing ([436466a](https://github.com/ahedderich/fluidSender/commit/436466a5549618c438690000c0b57a0b4c4862d2)), closes [#43](https://github.com/ahedderich/fluidSender/issues/43)
* **ui:** add GCode text viewer to 3D viewport ([16b1760](https://github.com/ahedderich/fluidSender/commit/16b17603f50afe7bdf3e9cb23bdc19980dac91c7))
* **ui:** add GCode text viewer to 3D viewport ([4813c09](https://github.com/ahedderich/fluidSender/commit/4813c098e38c6746976cb065e5bffecb92fb8d65)), closes [#62](https://github.com/ahedderich/fluidSender/issues/62)
* **ui:** add Load Probe button to job panel tool list ([57a9723](https://github.com/ahedderich/fluidSender/commit/57a972372a17361eab63ce026dc73b0ecb2ba468))
* **ui:** add magazine-slot safety checks and RapidChange ATC strategy ([eb1ebd3](https://github.com/ahedderich/fluidSender/commit/eb1ebd3e6318fef0f0bff2b2ad0da28d6b9f74be))
* **ui:** build atc-managed engine and fix ATC toolchange gaps ([3d89ff7](https://github.com/ahedderich/fluidSender/commit/3d89ff7efc0dfb58797ca30f81a0c42aaba390a1))
* **ui:** build atc-managed engine and fix ATC toolchange gaps ([55fbc25](https://github.com/ahedderich/fluidSender/commit/55fbc25370f152008e45941b2924db336472bbfa)), closes [#43](https://github.com/ahedderich/fluidSender/issues/43)
* **ui:** check FluidNC and FluidSender versions against GitHub releases ([ce7956e](https://github.com/ahedderich/fluidSender/commit/ce7956ec5cfaac0758ff3f0f904e25e3e645acf2)), closes [#51](https://github.com/ahedderich/fluidSender/issues/51)
* **ui:** detect FluidNC config validity and boot network/HTTP status ([d8203d1](https://github.com/ahedderich/fluidSender/commit/d8203d177a25384e9bac9666edd6f3226da02c68))
* **ui:** dim already-executed toolpath segments in 3D viewport ([582c9de](https://github.com/ahedderich/fluidSender/commit/582c9de2c9aea9bf7d4abaaa7ac1ddbf205c3eeb))
* **ui:** dim already-executed toolpath segments in 3D viewport ([0ee0944](https://github.com/ahedderich/fluidSender/commit/0ee0944244ec5d44a8dc4972c6a1e185b9df4d52)), closes [#45](https://github.com/ahedderich/fluidSender/issues/45)
* **ui:** harden container image with distroless nonroot base ([92c613c](https://github.com/ahedderich/fluidSender/commit/92c613c94d92da588333132f674bd3e5d7445b29))
* **ui:** overhaul ATC magazine automation config in toolchange settings ([d99c83e](https://github.com/ahedderich/fluidSender/commit/d99c83e0abc277f19418ec856c76666debbf92d3)), closes [#43](https://github.com/ahedderich/fluidSender/issues/43)
* **ui:** replace override sliders with step buttons ([56b4d12](https://github.com/ahedderich/fluidSender/commit/56b4d1231006f2935c04080ebd685c268ecfd900))
* **ui:** show last measured runtime in file browser table ([c76a2ae](https://github.com/ahedderich/fluidSender/commit/c76a2aea0216593b2fc8e477454675ec1cda6d58))


### Bug Fixes

* ci/cd and smaller bugs with overrides ([d30aa81](https://github.com/ahedderich/fluidSender/commit/d30aa81840cf93c1087fd4f2aae127d2a83046fc))
* **ci:** add explicit GITHUB_TOKEN permissions to workflows ([67cf585](https://github.com/ahedderich/fluidSender/commit/67cf5854886a417574f93e1587ac66c56b6366b2))
* **ci:** add explicit GITHUB_TOKEN permissions to workflows ([eb80b94](https://github.com/ahedderich/fluidSender/commit/eb80b94061f5defa5962254b39676aef06ff7d5a))
* commit history and commentless release please version tagging ([1af46e2](https://github.com/ahedderich/fluidSender/commit/1af46e2bbd06190189686d3adf1303ab64d1dc07))
* **deps:** resolve HIGH CVEs in ui and sim-ui dependencies ([5ff0f7e](https://github.com/ahedderich/fluidSender/commit/5ff0f7e1e552fae74147ad8134a97929ccfd6de9))
* **deps:** upgrade esbuild to 0.28.1 to resolve Windows vulnerability ([b2a42b1](https://github.com/ahedderich/fluidSender/commit/b2a42b1f911a03bdc99b0f4e967a4381940ae23d))
* **deps:** upgrade esbuild to 0.28.1 to resolve Windows vulnerability ([4fdcde2](https://github.com/ahedderich/fluidSender/commit/4fdcde23cb51ae17e0d68ec2b6275a41a922b704))
* **desktop:** ad-hoc sign macOS builds to fix arm64 launch failure ([70c404d](https://github.com/ahedderich/fluidSender/commit/70c404df5b6dc55823bd962357c8a79410aec240))
* **desktop:** ad-hoc sign macOS builds to fix arm64 launch failure ([82a6031](https://github.com/ahedderich/fluidSender/commit/82a60311827742290084daeb4640fc15ad6c0956))
* **desktop:** build both x64 and arm64 zips for macOS ([b3a6339](https://github.com/ahedderich/fluidSender/commit/b3a63397579ccd706544f20ab0247cc131a89729))
* **docs:** use GitHub private vulnerability reporting in SECURITY.md ([0485154](https://github.com/ahedderich/fluidSender/commit/048515469daf192c61f25cadf7ebcdad21aeb6fe))
* **docs:** use GitHub private vulnerability reporting in SECURITY.md ([e95477a](https://github.com/ahedderich/fluidSender/commit/e95477ad566e8c7622d5639bdf6324c95f0695b9))
* Drop component prefix from release-please tag names ([c7ef6ba](https://github.com/ahedderich/fluidSender/commit/c7ef6baadae0350ccb03e28d2560626e2eb11dde))
* harden dev containers ([1ac5853](https://github.com/ahedderich/fluidSender/commit/1ac5853b55096fedecaaf0dfcfde912c5b1c0879))
* job panel meas time ([91322ba](https://github.com/ahedderich/fluidSender/commit/91322ba9d1388d65e3f2311f084b8bd8e60549b8))
* **job:** track active runtime accurately, show live timer, smooth an… ([adec094](https://github.com/ahedderich/fluidSender/commit/adec0949ba7c8715c6ae6c2de6ced5fe39c1a7e1))
* **job:** track active runtime accurately, show live timer, smooth analysis progress ([c43d31a](https://github.com/ahedderich/fluidSender/commit/c43d31a314d5385cbbca8c65b7aef6796972273f))
* **machine:** stop resetting override percentages between Ov: reports ([35782e0](https://github.com/ahedderich/fluidSender/commit/35782e00b4667f5d9368ebd862e8174db6b7571f)), closes [#90](https://github.com/ahedderich/fluidSender/issues/90)
* **probing:** add probe height parameter to rotation wizard ([21235fb](https://github.com/ahedderich/fluidSender/commit/21235fbd771248d3caa2d520c5bd8ac11af8e635))
* **probing:** add probe height parameter to rotation wizard ([31f89be](https://github.com/ahedderich/fluidSender/commit/31f89bebd9306bee68f252bc30607a17c91363ae))
* **probing:** correct rotation sign convention and add correction context ([ea5bb7b](https://github.com/ahedderich/fluidSender/commit/ea5bb7b545da03baa8d78daf612935e027ff7fe1)), closes [#89](https://github.com/ahedderich/fluidSender/issues/89)
* release pipeline target fix ([9d7e53f](https://github.com/ahedderich/fluidSender/commit/9d7e53fe789c5ab17c4aa6ae6b76db885adf9841))
* release please github app integration ([3e5ce1f](https://github.com/ahedderich/fluidSender/commit/3e5ce1f196153a9ca320cc43b35e32f6bf2685f9))
* **release-please:** pin target-branch so releases land on main ([70a3c93](https://github.com/ahedderich/fluidSender/commit/70a3c9317fe181806a7928dbd60986f660e7e925))
* **release-please:** pin target-branch so releases land on main ([418e036](https://github.com/ahedderich/fluidSender/commit/418e036d2450aec09568d7583676a224aca76293))
* **sim-ui:** resolve CRITICAL/HIGH CVEs in transitive deps ([64037b9](https://github.com/ahedderich/fluidSender/commit/64037b98a3751a45a5288090fc6bf01d0d69a49f))
* **sim-ui:** resolve CRITICAL/HIGH CVEs in transitive deps ([b131f94](https://github.com/ahedderich/fluidSender/commit/b131f947abfdb372d4360b762b84e3e7ea655ac8))
* **ui:** always show file browser row action buttons ([08ccf38](https://github.com/ahedderich/fluidSender/commit/08ccf38d8741d57b95929e244e9dcd97f21b0935))
* **ui:** bundle three.js locally instead of loading from CDN ([1fa3960](https://github.com/ahedderich/fluidSender/commit/1fa3960c2cc53813d9c66cbbb67578acfdfef845))
* **ui:** bundle three.js locally instead of loading from CDN ([47b6795](https://github.com/ahedderich/fluidSender/commit/47b679594ee2407df1b48c0291e16e7cead37396))
* **ui:** cap upper section height so tool list scrolls internally ([e9698df](https://github.com/ahedderich/fluidSender/commit/e9698df9cb80cb604a8e5ff7483fa501e376540e))
* **ui:** correct feedrate unit and merge toolchange tool info with to… ([564184a](https://github.com/ahedderich/fluidSender/commit/564184a5260331105003d50628d60fa905b4e3f3))
* **ui:** correct feedrate unit and merge toolchange tool info with tool number ([87e9d08](https://github.com/ahedderich/fluidSender/commit/87e9d08129013845dd3be16ce515022089a73b6c))
* **ui:** harden container image with distroless nonroot base ([b78a3c2](https://github.com/ahedderich/fluidSender/commit/b78a3c23ba4ba26a4659b89047734794c36967f0))
* **ui:** let mousewheel scroll the page over the console unless focused ([52c7256](https://github.com/ahedderich/fluidSender/commit/52c725628d15399e482357bd38b1772171beec79))
* **ui:** move distroless base to debian13 to clear libssl3 CVEs ([a8f9ae9](https://github.com/ahedderich/fluidSender/commit/a8f9ae9446c780066b79fb72a30d3de57dd34094))
* **ui:** move distroless base to debian13 to clear libssl3 CVEs ([a1c206f](https://github.com/ahedderich/fluidSender/commit/a1c206f302da25593f61249c587d872437ab921e))
* **ui:** poll status faster while a job is actively sending ([0e4353d](https://github.com/ahedderich/fluidSender/commit/0e4353df703bc990a5b3d61d48347951d03142bd))
* **ui:** poll status faster while a job is actively sending ([86ae101](https://github.com/ahedderich/fluidSender/commit/86ae101d64d5cd4e99f72c6b64bcf3c4c25d3d25))
* **ui:** relabel goto XY/Z buttons and confirm the Z=10 move ([b0497da](https://github.com/ahedderich/fluidSender/commit/b0497daae15e0ec6910bcc50c3391bbfa472ba07))
* **ui:** replace unmaintained expr-eval with expr-eval-fork ([0c69a33](https://github.com/ahedderich/fluidSender/commit/0c69a339c50905908dca0efc0df8af894877ff16))
* **ui:** resolve CRITICAL/HIGH CVEs in transitive deps ([a3a0a97](https://github.com/ahedderich/fluidSender/commit/a3a0a9777e027bb6003a13c1410ec5c5a0be47e7))
* **ui:** show connected machine name in tab title ([ec42e48](https://github.com/ahedderich/fluidSender/commit/ec42e4893eaa4ace79f5e97eb4907d56788340ac))
* **ui:** use text pill load button instead of play icon in file browser ([8cc3c16](https://github.com/ahedderich/fluidSender/commit/8cc3c16f493ea1294bfbcd05dcac2569c92a634c))
* **ui:** virtualize GCode text viewer for large files ([f9d7516](https://github.com/ahedderich/fluidSender/commit/f9d7516f48c2209de44142e16e52e590ede7d3a7))
* **ui:** virtualize GCode text viewer for large files ([c09bd20](https://github.com/ahedderich/fluidSender/commit/c09bd206698aeae48e293e5b61cfbddd1a7dfedb)), closes [#62](https://github.com/ahedderich/fluidSender/issues/62)
* updated security.md and unfixabled vulerability definition ([c5f73c3](https://github.com/ahedderich/fluidSender/commit/c5f73c3c5865fa87f7c3b1faf104c1cfd4ce1223))
* **viewport:** stop canvas intrinsic aspect ratio from resizing the container ([5897024](https://github.com/ahedderich/fluidSender/commit/5897024a1de4bffa7bd86ed2d4974765f5e58ec9))
* **webcam:** reconnect stream fresh after tab is backgrounded ([f293672](https://github.com/ahedderich/fluidSender/commit/f293672addeda0e4cbac4af6b7d0f25a9cfd8705))


### Performance Improvements

* **gcode:** cut job-load time and on-disk artefact size for large files ([786800c](https://github.com/ahedderich/fluidSender/commit/786800c24d5c5613d95832a9384f5e3d46894a69))
* **sync:** coalesce machine/job state updates to latest on the client ([79074bf](https://github.com/ahedderich/fluidSender/commit/79074bffc4566d3363fcba5e1b708aeccd7b6930))
* **viewport:** debounce resize recalculation by 300ms ([6cba111](https://github.com/ahedderich/fluidSender/commit/6cba1119fc1238c07dc76df77ddfe913b35e69f5))

## [0.3.0](https://github.com/ahedderich/fluidSender/compare/v0.2.0...v0.3.0) (2026-07-23)


### Features

* **api:** add external file upload API for third-party tools ([8982bc7](https://github.com/ahedderich/fluidSender/commit/8982bc7701e72956f8052ee0b17b9c8a1697922d))
* **api:** add external file upload API for third-party tools ([d9dfd4f](https://github.com/ahedderich/fluidSender/commit/d9dfd4fa8ca0236c15e9890c8631e379294ef2af)), closes [#63](https://github.com/ahedderich/fluidSender/issues/63)
* **desktop:** add Electron desktop app with network settings and CI … ([d537e16](https://github.com/ahedderich/fluidSender/commit/d537e167fd0ef95b6f7ff3a45ce9131684f7f2c9))
* **desktop:** add Electron desktop app with network settings and CI builds ([8348ac0](https://github.com/ahedderich/fluidSender/commit/8348ac0eac8a516867b5f5d946a4074364534d31))
* **gcode:** detect CAM generator and extract per-generator tool info ([729ab0e](https://github.com/ahedderich/fluidSender/commit/729ab0e070941321cc9af0fe3d2180a06f9f3650)), closes [#64](https://github.com/ahedderich/fluidSender/issues/64)
* **gcode:** model acceleration and cornering deceleration in time estimates ([5aecf8c](https://github.com/ahedderich/fluidSender/commit/5aecf8ca28087eb8536a6b89afe44e5accfc5bfd)), closes [#46](https://github.com/ahedderich/fluidSender/issues/46)
* **sim:** report live config.yaml and make firmware version testable ([9325cb1](https://github.com/ahedderich/fluidSender/commit/9325cb110ebec6c9835bac8d8b0bd40a980e2ebb))
* **sim:** track and report tool number for atc-passthrough testing ([436466a](https://github.com/ahedderich/fluidSender/commit/436466a5549618c438690000c0b57a0b4c4862d2)), closes [#43](https://github.com/ahedderich/fluidSender/issues/43)
* **ui:** add GCode text viewer to 3D viewport ([16b1760](https://github.com/ahedderich/fluidSender/commit/16b17603f50afe7bdf3e9cb23bdc19980dac91c7))
* **ui:** add GCode text viewer to 3D viewport ([4813c09](https://github.com/ahedderich/fluidSender/commit/4813c098e38c6746976cb065e5bffecb92fb8d65)), closes [#62](https://github.com/ahedderich/fluidSender/issues/62)
* **ui:** add Load Probe button to job panel tool list ([57a9723](https://github.com/ahedderich/fluidSender/commit/57a972372a17361eab63ce026dc73b0ecb2ba468))
* **ui:** add magazine-slot safety checks and RapidChange ATC strategy ([eb1ebd3](https://github.com/ahedderich/fluidSender/commit/eb1ebd3e6318fef0f0bff2b2ad0da28d6b9f74be))
* **ui:** build atc-managed engine and fix ATC toolchange gaps ([3d89ff7](https://github.com/ahedderich/fluidSender/commit/3d89ff7efc0dfb58797ca30f81a0c42aaba390a1))
* **ui:** build atc-managed engine and fix ATC toolchange gaps ([55fbc25](https://github.com/ahedderich/fluidSender/commit/55fbc25370f152008e45941b2924db336472bbfa)), closes [#43](https://github.com/ahedderich/fluidSender/issues/43)
* **ui:** check FluidNC and FluidSender versions against GitHub releases ([ce7956e](https://github.com/ahedderich/fluidSender/commit/ce7956ec5cfaac0758ff3f0f904e25e3e645acf2)), closes [#51](https://github.com/ahedderich/fluidSender/issues/51)
* **ui:** detect FluidNC config validity and boot network/HTTP status ([d8203d1](https://github.com/ahedderich/fluidSender/commit/d8203d177a25384e9bac9666edd6f3226da02c68))
* **ui:** dim already-executed toolpath segments in 3D viewport ([582c9de](https://github.com/ahedderich/fluidSender/commit/582c9de2c9aea9bf7d4abaaa7ac1ddbf205c3eeb))
* **ui:** dim already-executed toolpath segments in 3D viewport ([0ee0944](https://github.com/ahedderich/fluidSender/commit/0ee0944244ec5d44a8dc4972c6a1e185b9df4d52)), closes [#45](https://github.com/ahedderich/fluidSender/issues/45)
* **ui:** overhaul ATC magazine automation config in toolchange settings ([d99c83e](https://github.com/ahedderich/fluidSender/commit/d99c83e0abc277f19418ec856c76666debbf92d3)), closes [#43](https://github.com/ahedderich/fluidSender/issues/43)
* **ui:** replace override sliders with step buttons ([56b4d12](https://github.com/ahedderich/fluidSender/commit/56b4d1231006f2935c04080ebd685c268ecfd900))
* **ui:** show last measured runtime in file browser table ([c76a2ae](https://github.com/ahedderich/fluidSender/commit/c76a2aea0216593b2fc8e477454675ec1cda6d58))


### Bug Fixes

* **ci:** add explicit GITHUB_TOKEN permissions to workflows ([67cf585](https://github.com/ahedderich/fluidSender/commit/67cf5854886a417574f93e1587ac66c56b6366b2))
* **ci:** add explicit GITHUB_TOKEN permissions to workflows ([eb80b94](https://github.com/ahedderich/fluidSender/commit/eb80b94061f5defa5962254b39676aef06ff7d5a))
* **deps:** upgrade esbuild to 0.28.1 to resolve Windows vulnerability ([b2a42b1](https://github.com/ahedderich/fluidSender/commit/b2a42b1f911a03bdc99b0f4e967a4381940ae23d))
* **deps:** upgrade esbuild to 0.28.1 to resolve Windows vulnerability ([4fdcde2](https://github.com/ahedderich/fluidSender/commit/4fdcde23cb51ae17e0d68ec2b6275a41a922b704))
* **desktop:** ad-hoc sign macOS builds to fix arm64 launch failure ([70c404d](https://github.com/ahedderich/fluidSender/commit/70c404df5b6dc55823bd962357c8a79410aec240))
* **desktop:** ad-hoc sign macOS builds to fix arm64 launch failure ([82a6031](https://github.com/ahedderich/fluidSender/commit/82a60311827742290084daeb4640fc15ad6c0956))
* **desktop:** build both x64 and arm64 zips for macOS ([b3a6339](https://github.com/ahedderich/fluidSender/commit/b3a63397579ccd706544f20ab0247cc131a89729))
* **docs:** use GitHub private vulnerability reporting in SECURITY.md ([0485154](https://github.com/ahedderich/fluidSender/commit/048515469daf192c61f25cadf7ebcdad21aeb6fe))
* **docs:** use GitHub private vulnerability reporting in SECURITY.md ([e95477a](https://github.com/ahedderich/fluidSender/commit/e95477ad566e8c7622d5639bdf6324c95f0695b9))
* **probing:** add probe height parameter to rotation wizard ([21235fb](https://github.com/ahedderich/fluidSender/commit/21235fbd771248d3caa2d520c5bd8ac11af8e635))
* **probing:** add probe height parameter to rotation wizard ([31f89be](https://github.com/ahedderich/fluidSender/commit/31f89bebd9306bee68f252bc30607a17c91363ae))
* **sim-ui:** resolve CRITICAL/HIGH CVEs in transitive deps ([64037b9](https://github.com/ahedderich/fluidSender/commit/64037b98a3751a45a5288090fc6bf01d0d69a49f))
* **sim-ui:** resolve CRITICAL/HIGH CVEs in transitive deps ([b131f94](https://github.com/ahedderich/fluidSender/commit/b131f947abfdb372d4360b762b84e3e7ea655ac8))
* **ui:** always show file browser row action buttons ([08ccf38](https://github.com/ahedderich/fluidSender/commit/08ccf38d8741d57b95929e244e9dcd97f21b0935))
* **ui:** bundle three.js locally instead of loading from CDN ([1fa3960](https://github.com/ahedderich/fluidSender/commit/1fa3960c2cc53813d9c66cbbb67578acfdfef845))
* **ui:** bundle three.js locally instead of loading from CDN ([47b6795](https://github.com/ahedderich/fluidSender/commit/47b679594ee2407df1b48c0291e16e7cead37396))
* **ui:** cap upper section height so tool list scrolls internally ([e9698df](https://github.com/ahedderich/fluidSender/commit/e9698df9cb80cb604a8e5ff7483fa501e376540e))
* **ui:** let mousewheel scroll the page over the console unless focused ([52c7256](https://github.com/ahedderich/fluidSender/commit/52c725628d15399e482357bd38b1772171beec79))
* **ui:** relabel goto XY/Z buttons and confirm the Z=10 move ([b0497da](https://github.com/ahedderich/fluidSender/commit/b0497daae15e0ec6910bcc50c3391bbfa472ba07))
* **ui:** resolve CRITICAL/HIGH CVEs in transitive deps ([a3a0a97](https://github.com/ahedderich/fluidSender/commit/a3a0a9777e027bb6003a13c1410ec5c5a0be47e7))
* **ui:** show connected machine name in tab title ([ec42e48](https://github.com/ahedderich/fluidSender/commit/ec42e4893eaa4ace79f5e97eb4907d56788340ac))
* **ui:** use text pill load button instead of play icon in file browser ([8cc3c16](https://github.com/ahedderich/fluidSender/commit/8cc3c16f493ea1294bfbcd05dcac2569c92a634c))
* **ui:** virtualize GCode text viewer for large files ([f9d7516](https://github.com/ahedderich/fluidSender/commit/f9d7516f48c2209de44142e16e52e590ede7d3a7))
* **ui:** virtualize GCode text viewer for large files ([c09bd20](https://github.com/ahedderich/fluidSender/commit/c09bd206698aeae48e293e5b61cfbddd1a7dfedb)), closes [#62](https://github.com/ahedderich/fluidSender/issues/62)


### Performance Improvements

* **gcode:** cut job-load time and on-disk artefact size for large files ([786800c](https://github.com/ahedderich/fluidSender/commit/786800c24d5c5613d95832a9384f5e3d46894a69))

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
