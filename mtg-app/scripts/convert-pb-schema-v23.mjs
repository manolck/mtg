/**
 * Convert PocketBase <=0.22 collection JSON (`schema` + nested `options`)
 * to 0.23+ import format (`fields` with flattened settings).
 */
import fs from 'node:fs';

const SYSTEM_FIELDS = [
  {
    autogeneratePattern: '[a-z0-9]{15}',
    hidden: false,
    id: 'text_pk_id',
    max: 15,
    min: 15,
    name: 'id',
    pattern: '^[a-z0-9]+$',
    presentable: false,
    primaryKey: true,
    required: true,
    system: true,
    type: 'text',
  },
  {
    hidden: false,
    id: 'autodate_created',
    name: 'created',
    onCreate: true,
    onUpdate: false,
    presentable: false,
    system: false,
    type: 'autodate',
  },
  {
    hidden: false,
    id: 'autodate_updated',
    name: 'updated',
    onCreate: true,
    onUpdate: true,
    presentable: false,
    system: false,
    type: 'autodate',
  },
];

const PREFERRED_ORDER = [
  'users',
  'cards',
  'user_collections',
  'collection_items',
  'decks',
  'imports',
  'legal',
  'wishlist',
];

function convertField(field) {
  const options = field.options && typeof field.options === 'object' ? field.options : {};
  const next = {
    id: field.id,
    name: field.name,
    type: field.type,
    required: Boolean(field.required),
    presentable: Boolean(field.presentable),
    system: Boolean(field.system),
    hidden: Boolean(field.hidden),
  };

  switch (field.type) {
    case 'text':
      if (options.min != null) next.min = options.min;
      if (options.max != null) next.max = options.max;
      if (options.pattern) next.pattern = options.pattern;
      break;
    case 'number':
      if (options.min != null) next.min = options.min;
      if (options.max != null) next.max = options.max;
      next.onlyInt = Boolean(options.noDecimal);
      break;
    case 'json':
      if (options.maxSize != null) next.maxSize = options.maxSize;
      break;
    case 'relation':
      next.collectionId = options.collectionId;
      next.cascadeDelete = Boolean(options.cascadeDelete);
      if (options.minSelect != null) next.minSelect = options.minSelect;
      next.maxSelect = options.maxSelect ?? 1;
      if (Array.isArray(options.displayFields) && options.displayFields.length) {
        next.displayFields = options.displayFields;
      }
      break;
    case 'select':
      next.maxSelect = options.maxSelect ?? 1;
      next.values = options.values ?? [];
      break;
    case 'date':
      if (options.min) next.min = options.min;
      if (options.max) next.max = options.max;
      break;
    case 'bool':
    case 'autodate':
      break;
    default:
      Object.assign(next, options);
  }

  return next;
}

function convertCollection(collection, apiRules) {
  const alreadyV23 = Array.isArray(collection.fields) && !collection.schema;
  const sourceFields = alreadyV23 ? collection.fields : (collection.schema ?? collection.fields ?? []);
  const converted = alreadyV23 ? sourceFields : sourceFields.map(convertField);
  const hasId = converted.some((field) => field.name === 'id');
  const fields = hasId ? converted : [...SYSTEM_FIELDS, ...converted];

  const rules = apiRules?.[collection.name] ?? {};
  return {
    id: collection.id,
    name: collection.name,
    type: collection.type,
    system: Boolean(collection.system),
    fields,
    indexes: collection.indexes ?? [],
    listRule: rules.listRule !== undefined ? rules.listRule : collection.listRule,
    viewRule: rules.viewRule !== undefined ? rules.viewRule : collection.viewRule,
    createRule: rules.createRule !== undefined ? rules.createRule : collection.createRule,
    updateRule: rules.updateRule !== undefined ? rules.updateRule : collection.updateRule,
    deleteRule: rules.deleteRule !== undefined ? rules.deleteRule : collection.deleteRule,
  };
}

function convert(collections, apiRules) {
  const converted = collections.map((collection) => convertCollection(collection, apiRules));
  converted.sort((a, b) => {
    const ai = PREFERRED_ORDER.indexOf(a.name);
    const bi = PREFERRED_ORDER.indexOf(b.name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return converted;
}

const [,, inputPath, outputPath, rulesPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node convert-pb-schema-v23.mjs <input.json> <output.json> [api-rules.json]');
  process.exit(1);
}

const collections = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const apiRules = rulesPath ? JSON.parse(fs.readFileSync(rulesPath, 'utf8')) : null;
fs.writeFileSync(outputPath, `${JSON.stringify(convert(collections, apiRules), null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
