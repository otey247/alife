# Strata — artificial life engine

An evolving world in the browser. Every organism runs the same rules; a genome of 25 traits and
211 neural weights decides whether it lives as a plant, a grazer, a hunter or something in between.

## Run it

- Open `dist/strata.html` (one self-contained file), or serve this folder and open `index.html` wrapped in a page.
- `node build.js` rebuilds `dist/strata.html` from `index.html`, `engine.js` and `ui.js`.
- `node test/headless.js 50000 ecosystem continents 7` runs the engine without a browser and prints a census.
- `node test/pred.js 7 120000 0` reports how often grazers and hunters are present; `node test/r0.js 7 20` follows one cohort of hunters.

## Files

| File | Purpose |
| --- | --- |
| `engine.js` | The simulation. No DOM; runs in the browser or Node. |
| `ui.js` | Map, controls, phylogeny, charts. Uses only the engine's public API. |
| `index.html` | Markup and styles. |
| `test/` | Headless runs, profiling, browser smoke tests. |

## Model in brief

- **Light**: plants in a cell are sorted by stature; taller ones take light first. Stature costs upkeep in proportion to gravity. Seeds need light at ground level to establish.
- **Energy**: photosynthesis, plant digestion and flesh digestion share one budget, so specialists beat generalists. Leaves cost upkeep; legs cut photosynthesis.
- **Senses and behaviour**: colour gradients, colour of moving bodies, the nearest body, the nearest moving stranger, habitat and warmth ahead feed a small heritable neural net that outputs turn, thrust and mouth.
- **Reproduction**: an `Outcrossing` gene sets how often a parent recombines with the nearest mature member of its species (traits gene by gene, wiring neuron by neuron). The rest of the time it clones with mutation.
- **Body size**: stride and sight grow with the body, upkeep grows faster, and a mouth cannot reach foliage far above it or bite animals much larger than itself.
- **Defence**: armour, toxin, size, canopy cover and a rootstock that grazing cannot reach.
- **Species**: a newborn that sits too far from its lineage's moving genetic centre founds a new species. Diet labels come from what members actually ate.
- **Resting eggs and seeds**: two genes set what share of offspring are laid dormant and how long they rest. They hatch where they were laid, so a lineage can sit out a famine or a predator boom. When a bank is full it loses eggs of whichever species has the most resting, so rare lineages keep theirs. A species with only resting offspring is dormant, not extinct.
- **Seeded start**: plants and algae at tick 0, grazer colonies at tick 500, hunters once grazers number 250. Hunters are released again, up to four times in total, whenever none are alive.
- **Kin scent**: animals tell their own species (1), other species of their genus (0.6) and strangers (0) apart by scent, not colour. A genus is a genetic clan: a new species keeps its parent's genus until it has drifted well away from the genome that founded it.
- **Attention**: the stranger an animal notices is the one that looms largest (size over distance), not simply the nearest.
- **Gut size**: plant digestion improves with adult body mass above 1.
- **Flesh quality**: flesh is worth `FLESH + RICH x (the victim's plant-digestion efficiency)` to a carnivore, so herbivores are rich food and other carnivores poor food. `RICH` sets how much margin hunting has; at the default hunters grow until prey limits them.
- **Immigration**: optional and off by default. When switched on in a seeded world, a guild that has died out is re-colonised from off the map.
- **Ceiling**: rooted and motile life have separate population ceilings (70% / 30%), and the ceiling never blocks a rare lineage.

## Extending

```js
ALife.registerGene({ key: 'glow', label: 'Bioluminescence', group: 'Appearance', min: 0, max: 1 }); // before new World()
ALife.upkeepModifiers.push(o => 1 + 0.2 * o.p.glow);
ALife.registerFounder('myco', { label: 'Fungus', habitat: 'land', genes: { /* real-unit values */ } });
world.addSystem('drought', w => { /* runs every tick */ }, 'canopy');
world.on('speciation', (child, parent) => {});
```

Tuning constants live in `ALife.C`.
