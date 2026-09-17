/// <reference path="../../../pb_data/types.d.ts" />

migrate(
  (app) => {
    const path = 'D:/Dev/mtg/mtg-app/pocketbase/play-collections.json';
    const cols = JSON.parse(toString($os.readFile(path)));
    for (const def of cols) {
      try {
        app.findCollectionByNameOrId(def.name);
        continue;
      } catch (e) {
        /* create below */
      }
      app.save(new Collection(def));
    }
  },
  (app) => {
    const names = ['play_rtc_signals', 'play_matches', 'play_seats', 'play_lobbies'];
    for (const name of names) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        /* ignore */
      }
    }
  }
);
