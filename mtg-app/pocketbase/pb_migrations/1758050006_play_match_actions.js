/// <reference path="../../../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('play_match_actions');
      return;
    } catch (e) {
      /* create below */
    }
    const path = 'D:/Dev/mtg/mtg-app/pocketbase/play-collections.json';
    const cols = JSON.parse(toString($os.readFile(path)));
    const def = cols.find((col) => col.name === 'play_match_actions');
    if (!def) throw new Error('play_match_actions missing from play-collections.json');
    app.save(new Collection(def));
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('play_match_actions'));
    } catch (e) {
      /* ignore */
    }
  }
);
