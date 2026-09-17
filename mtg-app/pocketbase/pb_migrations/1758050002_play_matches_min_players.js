/// <reference path="../../../pb_data/types.d.ts" />

migrate((app) => {
  const col = app.findCollectionByNameOrId('play_matches');
  const field = col.fields.getByName('playerIds');
  field.minSelect = 1;
  app.save(col);
});
