/// <reference path="../../../pb_data/types.d.ts" />

migrate((app) => {
  const col = app.findCollectionByNameOrId('play_lobbies');
  col.deleteRule =
    '@request.auth.id != "" && (hostId = @request.auth.id || @request.auth.roles ~ "admin")';
  app.save(col);
});
