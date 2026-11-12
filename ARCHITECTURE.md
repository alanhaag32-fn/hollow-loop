# How Hollow Loop is put together

The game is plain JavaScript ES modules in `src/js`, one folder per feature. `tools/build.mjs` bundles them into one
HTML page (the published game and the GitHub Pages site); `tools/serve.mjs` serves `src/` directly while developing.

## Where things live

| Folder | What's in it |
| --- | --- |
| `core/` | Helpers, the stat fold and effect hooks (`stats.js`), the save and its lifetimes (`save.js`), loading with every migration (`load.js`), growth curves, play events, pausing. Apart from `load.js` these import no features |
| `ui/` | Windows and the action/panel registries, HUD, log, floating text, target reticle, guide and intro, offline card, input |
| `hero/` | The core: health, mana, shield, looks, movement and dash; statuses; the three orbital slots and firing |
| `enemies/` | Variants, modifiers, boss mechanics (`enemies.js`), enemies on the field (`foes.js`), enemy shots |
| `combat/` | The hit pipeline both ways, deaths and kills |
| `modes/` | The main run; `abyss/` holds the Abyss mode |
| `gear/` `train/` `skills/` `web/` `index/` `bounty/` `wisp/` `progress/` | One feature each, with its data, rules, window and actions (`progress/` holds ascending, transcending with the Star Forge, stars and automation) |

## The few ideas everything follows

**Bonuses declare themselves.** Anything that changes a number (a web node, an Index tier, training and its
Overcharge, an affix, a shape bonus, a set bonus, a unique, Star Power, a star, a wisp's boon, the Altar, Abyss
milestones and rules, the Star Forge) has a `stats` function next to its description and is registered with `statSource()`. `computeStats()` folds
them using the definitions in `STATS` and knows none of the sources. To add a bonus, add it where it's described.

**Behaviour is effect hooks.** Anything that changes how play works has an `fx` object of named hooks (`deal`, `hit`,
`incoming`, `taken`, `revive`, `kill`, `cast`, `dash`, `dashEnd`, `tick`, `attackSpeed`, ...). Combat code calls `emit(name, ctx)`
and never checks which set, unique, node or status is active. Enemy modifiers and boss mechanics hook in the same way
through `foeEmit`.

**Run modes.** The main run and the Abyss are objects with the same shape (`stage`, `stepSpawns`, `kill`, `death`,
`escape`, `hud`, ...). Combat asks the current `mode`; `S.stage` is only ever the main run's stage.

**Actions and panels register next to their feature.** A button's `data-act` names an action; after any action the
game recalculates, re-renders the open window, saves and refreshes the HUD, so actions never do that themselves. A
feature that adds a tab to another feature's window registers it with `sheet()` (Transcend and the Abyss in the Tree).
A feature nothing calls into, like the Abyss, is imported once by `main.js` for its registrations.

**Kinds are one table entry each.** Each orbital weapon type is one `WEAPON` entry (sprite, trait, timing, muzzle,
how it shoots and how its hits look); each enemy variant is one `VARIANTS` entry (stats, gun, body look) plus one
`ATTACK` entry in `shots.js` (on-screen shot and off-screen version). Code asks the entry, never the type's name.

**Play events.** Code where something happens calls `tell(type, n, detail)` (a kill, a crit, a cast, a stage
cleared); bounties and the Index `listen` for them, so combat doesn't know either feature exists.

**Unlocks announce themselves.** Features that open at a stage register with `whenNewBest`; the main run only reports
new bests.

**Pausing.** Full-screen cards `hold` the game (`core/pause.js`); the loop asks `paused()`.

**Save fields have a lifetime.** `RUN` fields reset when you ascend, `CYCLE` fields when you transcend, `KEPT` fields
never (the web and echoes are `KEPT`: a Transcend only resets the echo power earned that cycle, and moves a share of
it into `echoMemory`). Old saves are upgraded in one place, `core/load.js`.

## Rules the build checks

- Top-level names are unique across modules (the bundle concatenates them).
- `npm run check`: no undeclared names, no imports of things a module doesn't export, no assigning to an import, no
  unused declarations. A `let` another module must change lives in an exported object (`hero.hp`, `view.HERO_X`, ...).
- Modules only declare things and register with the registries at load; anything that touches the page runs from an
  `init...()` that `main.js` calls.
