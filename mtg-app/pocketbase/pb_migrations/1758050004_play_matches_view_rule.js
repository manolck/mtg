/// <reference path="../../../pb_data/types.d.ts" />

migrate((app) => {
  const col = app.findCollectionByNameOrId('play_matches');
  const rule =
    '@request.auth.id != "" && (@request.auth.id = updatedBy || @request.auth.id ?= playerIds)';
  col.listRule = rule;
  col.viewRule = rule;
  col.updateRule = rule;
  app.save(col);
});
