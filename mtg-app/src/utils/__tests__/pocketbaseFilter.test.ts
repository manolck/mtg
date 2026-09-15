import { escapeFilterValue, pbEqual } from '../pocketbaseFilter';

describe('pocketbaseFilter', () => {
  it('escapes backslashes and double quotes', () => {
    expect(escapeFilterValue('a"b\\c')).toBe('a\\"b\\\\c');
  });

  it('builds an equality clause with escaped value', () => {
    expect(pbEqual('name', 'Lightning "Bolt"')).toBe('name = "Lightning \\"Bolt\\""');
  });

  it('leaves safe identifiers unchanged', () => {
    expect(pbEqual('userId', 'abc123xyz')).toBe('userId = "abc123xyz"');
  });
});
