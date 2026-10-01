/// <reference path="../../../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('play_lobby_messages');
      return;
    } catch (e) {
      /* create below */
    }
    const path = 'D:/Dev/mtg/mtg-app/pocketbase/play-collections.json';
    const cols = JSON.parse(toString($os.readFile(path)));
    const def = cols.find((col) => col.name === 'play_lobby_messages');
    if (!def) throw new Error('play_lobby_messages missing from play-collections.json');
    app.save(new Collection(def));
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('play_lobby_messages'));
    } catch (e) {
      /* ignore */
    }
  }
);
