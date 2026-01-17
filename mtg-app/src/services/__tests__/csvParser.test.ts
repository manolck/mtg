import { parseCSV } from '../csvParser';

// Mock console.warn to avoid noise in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
});

describe('csvParser', () => {
  describe('parseCSV', () => {
    it('should parse simple CSV with headers', () => {
      const csv = `Name,Quantity,Set code
Lightning Bolt,4,M21
Black Lotus,1,LEA`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[0].quantity).toBe(4);
      expect(result[0].setCode).toBe('M21');
      expect(result[1].name).toBe('Black Lotus');
      expect(result[1].quantity).toBe(1);
      expect(result[1].setCode).toBe('LEA');
    });

    it('should parse CSV without headers (name only)', () => {
      const csv = `Lightning Bolt
Black Lotus
Ancestral Recall`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[0].quantity).toBe(1);
      expect(result[1].name).toBe('Black Lotus');
      expect(result[1].quantity).toBe(1);
      expect(result[2].name).toBe('Ancestral Recall');
      expect(result[2].quantity).toBe(1);
    });

    it('should parse CSV with name and quantity', () => {
      const csv = `Lightning Bolt,4
Black Lotus,1
Ancestral Recall,1`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[0].quantity).toBe(4);
      expect(result[1].name).toBe('Black Lotus');
      expect(result[1].quantity).toBe(1);
    });

    it('should handle empty CSV', () => {
      const result = parseCSV('');
      expect(result).toEqual([]);
    });

    it('should handle CSV with only headers', () => {
      const csv = `Name,Quantity,Set code`;
      expect(() => parseCSV(csv)).toThrow('Aucune carte valide trouvée');
    });

    it('should handle foil field', () => {
      const csv = `Name,Quantity,Foil
Lightning Bolt,4,false
Black Lotus,1,true`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[0].quantity).toBe(4);
    });

    it('should validate cards with Zod and skip invalid ones', () => {
      const csv = `Name,Quantity,Set code
Lightning Bolt,4,M21
,1,LEA
Valid Card,2,STX`;

      const result = parseCSV(csv);

      // Should skip the card with empty name
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(c => c.name === 'Lightning Bolt')).toBe(true);
      expect(result.some(c => c.name === 'Valid Card')).toBe(true);
    });

    it('should handle CSV with collector number', () => {
      const csv = `Name,Quantity,Set code,Collector Number
Lightning Bolt,4,M21,161
Black Lotus,1,LEA,1`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[0].collectorNumber).toBe('161');
      expect(result[1].name).toBe('Black Lotus');
      expect(result[1].collectorNumber).toBe('1');
    });

    it('should handle CSV with rarity and condition', () => {
      const csv = `Name,Quantity,Set code,Rarity,Condition
Lightning Bolt,4,M21,Common,NM
Black Lotus,1,LEA,Rare,LP`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].rarity).toBe('Common');
      expect(result[0].condition).toBe('NM');
      expect(result[1].rarity).toBe('Rare');
      expect(result[1].condition).toBe('LP');
    });

    it('should handle CSV with language', () => {
      const csv = `Name,Quantity,Set code,Language
Lightning Bolt,4,M21,en
Éclair,2,M21,fr`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].language).toBe('en');
      expect(result[1].language).toBe('fr');
    });

    it('should throw error for CSV with more than 10000 cards', () => {
      const manyCards = Array.from({ length: 10001 }, (_, i) => `Card ${i},1,STX`).join('\n');
      const csv = `Name,Quantity,Set code\n${manyCards}`;

      expect(() => parseCSV(csv)).toThrow('10000');
    });

    it('should handle semicolon separator', () => {
      const csv = `Name;Quantity;Set code
Lightning Bolt;4;M21
Black Lotus;1;LEA`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[0].quantity).toBe(4);
    });

    it('should handle tab separator', () => {
      const csv = `Name\tQuantity\tSet code
Lightning Bolt\t4\tM21
Black Lotus\t1\tLEA`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
    });

    it('should skip comment lines starting with #', () => {
      const csv = `Name,Quantity,Set code
# This is a comment
Lightning Bolt,4,M21
# Another comment
Black Lotus,1,LEA`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[1].name).toBe('Black Lotus');
    });

    it('should handle multiverseid field', () => {
      const csv = `Name,Quantity,Set code,Multiverseid
Lightning Bolt,4,M21,123456
Black Lotus,1,LEA,1`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].multiverseid).toBe(123456);
      expect(result[1].multiverseid).toBe(1);
    });

    it('should handle scryfallId field', () => {
      const csv = `Name,Quantity,Set code,ScryfallId
Lightning Bolt,4,M21,abc123
Black Lotus,1,LEA,def456`;

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].scryfallId).toBe('abc123');
      expect(result[1].scryfallId).toBe('def456');
    });
  });
});




