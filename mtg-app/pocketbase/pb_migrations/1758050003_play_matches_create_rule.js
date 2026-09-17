/// <reference path="../../../pb_data/types.d.ts" />

migrate((app) => {
  const col = app.findCollectionByNameOrId('play_matches');
  col.createRule =
    '@request.auth.id != "" && @request.body.lobbyId.hostId = @request.auth.id';
  app.save(col);
});
