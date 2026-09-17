/// <reference path="../../../pb_data/types.d.ts" />

migrate((app) => {
  const col = app.findCollectionByNameOrId('play_seats');
  const field = col.fields.getByName('seatIndex');
  field.required = false;
  app.save(col);
});
