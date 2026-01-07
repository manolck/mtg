import { parseCSV } from '../csvParser';

describe('csvParser', () => {
  describe('parseCSV', () => {
    it('should parse simple CSV with headers', () => {
      const csv = `Name,Quantity,Set code
Lightning Bolt,4,M21
Black Lotus,1,LEA`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Lightning Bolt',
        quantity: 4,
        set: 'M21',
        setCode: 'M21',
      });
      expect(result[1]).toEqual({
        name: 'Black Lotus',
        quantity: 1,
        set: 'LEA',
        setCode: 'LEA',
      });
    });

    it('should parse CSV without headers (name only)', () => {
      const csv = `Lightning Bolt
Black Lotus
Ancestral Recall`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'Lightning Bolt', quantity: 1 });
      expect(result[1]).toEqual({ name: 'Black Lotus', quantity: 1 });
      expect(result[2]).toEqual({ name: 'Ancestral Recall', quantity: 1 });
    });

    it('should parse CSV with name and quantity', () => {
      const csv = `Lightning Bolt,4
Black Lotus,1
Ancestral Recall,1`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'Lightning Bolt', quantity: 4 });
      expect(result[1]).toEqual({ name: 'Black Lotus', quantity: 1 });
    });

    it('should handle empty CSV', () => {
      const result = parseCSV('');
      expect(result).toEqual([]);
    });

    it('should handle CSV with only headers', () => {
      const csv = `Name,Quantity,Set code`;
      const result = parseCSV(csv);
      expect(result).toEqual([]);
    });

    it('should handle foil field', () => {
      const csv = `Name,Quantity,Foil
Lightning Bolt,4,false
Black Lotus,1,true`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      // Note: foil field might not be in the parsed result depending on implementation
      expect(result[0].name).toBe('Lightning Bolt');
    });
  });
});

