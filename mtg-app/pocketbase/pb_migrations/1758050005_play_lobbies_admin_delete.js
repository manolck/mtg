/// <reference path="../../../pb_data/types.d.ts" />

migrate((app) => {
  const col = app.findCollectionByNameOrId('play_lobbies');
  col.deleteRule =
    '@request.auth.id != "" && (hostId = @request.auth.id || (@collection.users.id(@request.auth.id).roles != null && @collection.users.id(@request.auth.id).roles ~ "admin"))';
  app.save(col);
});
