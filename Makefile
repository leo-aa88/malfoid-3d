# Malfoid 3D — build the characters from the purchased assets and run the viewer.
#
#   make            build the model (if needed) and the web viewer
#   make dev        run the viewer with hot reload
#   make help       list all targets

BLENDER ?= $(HOME)/.local/opt/blender-4.5.16-linux-x64/blender
PYTHON  ?= python3
NPM     ?= npm

# purchased assets (kept out of git)
BASE_BLEND   := base_character.blend
BASE_PACK    := Gumroad_Anime_Female_BaseMesh
HAIR_PACK    := Bell_Hair_01
UNIFORM_PACK := Girls+Hogwarts+Uniform+Harry+Potter+Uniform+Slytherin+BLEND

TOOLS_PY     := $(wildcard tools/blender/*.py tools/blender/malfoid/*.py)
TEXTURES     := build/textures/Malfoid_Head_BaseColor.png build/textures/Malfoid_Body_BaseColor.png \
                build/textures/Malfoid_Crest.png
GLB          := public/models/malfoid.glb
BLEND_OUT    := build/malfoid.blend
GINNY_TEX    := build/textures/Ginny_Head_BaseColor.png build/textures/Ginny_Body_BaseColor.png \
                build/textures/Ginny_Crest.png
GINNY_GLB    := public/models/ginny.glb
GINNY_BLEND  := build/ginny.blend
RENDER_DIR   := docs/integration

.DEFAULT_GOAL := all
.PHONY: all help check-assets textures model ginny models renders install dev build preview typecheck clean clean-model distclean

all: models build ## Build both character models and the production viewer

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

check-assets: ## Verify Blender and the purchased asset packs are present
	@test -x "$(BLENDER)" || { echo "Blender 4.5 not found at $(BLENDER) (override with BLENDER=...)"; exit 1; }
	@for f in "$(BASE_BLEND)" "$(BASE_PACK)" "$(HAIR_PACK)" "$(UNIFORM_PACK)"; do \
		test -e "$$f" || { echo "missing purchased asset: $$f"; exit 1; }; \
	done
	@echo "assets OK"

# --- character pipeline ---------------------------------------------------

textures: $(TEXTURES) ## Build skin/eye/brow textures from the base mesh pack

$(TEXTURES) &: tools/textures/make_textures.py tools/textures/make_crest.py | check-assets
	$(PYTHON) tools/textures/make_textures.py
	$(PYTHON) tools/textures/make_crest.py

models: model ginny ## Build both characters

model: $(GLB) ## Build build/malfoid.blend and public/models/malfoid.glb

$(GLB) $(BLEND_OUT) &: $(TEXTURES) $(TOOLS_PY) $(BASE_BLEND) | check-assets
	@mkdir -p build public/models
	"$(BLENDER)" -b -t 4 "$(BASE_BLEND)" -P tools/blender/build_head.py -- \
		--stage 5 --save $(BLEND_OUT) --glb $(GLB)

# Ginny: the same pipeline with MF_CHAR=ginny (her own textures, outputs and settings,
# tools/blender/malfoid/character.py)
$(GINNY_TEX) &: tools/textures/make_textures.py tools/textures/make_crest_gryffindor.py tools/blender/malfoid/character.py | check-assets
	MF_CHAR=ginny $(PYTHON) tools/textures/make_textures.py
	$(PYTHON) tools/textures/make_crest_gryffindor.py

ginny: $(GINNY_GLB) ## Build build/ginny.blend and public/models/ginny.glb

$(GINNY_GLB) $(GINNY_BLEND) &: $(GINNY_TEX) $(TOOLS_PY) $(BASE_BLEND) | check-assets
	@mkdir -p build public/models
	MF_CHAR=ginny "$(BLENDER)" -b -t 4 "$(BASE_BLEND)" -P tools/blender/build_head.py -- \
		--stage 5 --save $(GINNY_BLEND) --glb $(GINNY_GLB)

renders: $(TEXTURES) | check-assets ## Render the validation set into docs/integration
	@mkdir -p $(RENDER_DIR)
	MF_FRAME=fixed "$(BLENDER)" -b -t 4 "$(BASE_BLEND)" -P tools/blender/build_head.py -- \
		--stage 5 --res 1000 --views validation --posetest idle:40 --out $(RENDER_DIR)

# --- web viewer -------------------------------------------------------------

node_modules: package.json package-lock.json
	$(NPM) install --no-audit --no-fund
	@touch node_modules

install: node_modules ## Install npm dependencies

typecheck: node_modules ## Type-check the TypeScript sources
	npx tsc --noEmit

dev: node_modules $(GLB) ## Run the viewer dev server
	npx vite

build: node_modules $(GLB) ## Type-check and build the viewer into dist/
	npx tsc --noEmit
	npx vite build

preview: build ## Serve the production build locally
	npx vite preview

# --- cleanup ----------------------------------------------------------------

clean: ## Remove the viewer build output
	rm -rf dist

clean-model: ## Remove generated textures, .blend and .glb (checkpoints are kept)
	rm -rf build/textures $(BLEND_OUT) $(GLB) public/models/malfoid.json $(GINNY_BLEND) $(GINNY_GLB) public/models/ginny.json

distclean: clean clean-model ## Also remove node_modules
	rm -rf node_modules
