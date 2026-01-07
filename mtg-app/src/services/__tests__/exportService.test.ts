import {
  exportToCSV,
  exportToJSON,
  exportToDeckbox,
  exportToMoxfield,
  exportCollection,
  downloadFile,
} from '../exportService';
import type { UserCard } from '../../types/card';

describe('exportService', () => {
  const mockCards: UserCard[] = [
    {
      id: '1',
      name: 'Lightning Bolt',
      quantity: 4,
      setCode: 'M21',
      set: 'M21',
      collectorNumber: '161',
      rarity: 'Common',
      language: 'en',
      userId: 'user1',
      createdAt: new Date('2024-01-01'),
      mtgData: {
        name: 'Lightning Bolt',
        setName: 'Core Set 2021',
        rarity: 'Common',
      },
    },
    {
      id: '2',
      name: 'Black Lotus',
      quantity: 1,
      setCode: 'LEA',
      set: 'LEA',
      collectorNumber: '1',
      rarity: 'Rare',
      condition: 'Near Mint',
      language: 'en',
      userId: 'user1',
      createdAt: new Date('2024-01-02'),
      mtgData: {
        name: 'Black Lotus',
        setName: 'Alpha Edition',
        rarity: 'Rare',
      },
    },
  ];

  describe('exportToCSV', () => {
    it('should export cards to CSV format', () => {
      const result = exportToCSV(mockCards);
      
      expect(result).toContain('Name,Quantity,Set code');
      expect(result).toContain('Lightning Bolt,4,M21');
      expect(result).toContain('Black Lotus,1,LEA');
    });

    it('should include metadata when option is set', () => {
      const result = exportToCSV(mockCards, { format: 'csv', includeMetadata: true });
      
      expect(result).toContain('Created At');
      expect(result).toContain('Card ID');
      expect(result).toContain('1'); // Card ID
    });

    it('should handle empty array', () => {
      const result = exportToCSV([]);
      
      expect(result).toContain('Name,Quantity');
      expect(result.split('\n').length).toBe(1); // Header only
    });

    it('should escape CSV special characters', () => {
      const cardWithComma: UserCard = {
        id: '3',
        name: 'Card, with comma',
        quantity: 1,
        userId: 'user1',
        createdAt: new Date(),
      };
      
      const result = exportToCSV([cardWithComma]);
      expect(result).toContain('"Card, with comma"');
    });
  });

  describe('exportToJSON', () => {
    it('should export cards to JSON format', () => {
      const result = exportToJSON(mockCards);
      const parsed = JSON.parse(result);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Lightning Bolt');
      expect(parsed[0].quantity).toBe(4);
    });

    it('should include metadata when option is set', () => {
      const result = exportToJSON(mockCards, { format: 'json', includeMetadata: true });
      const parsed = JSON.parse(result);
      
      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('createdAt');
      expect(parsed[0]).toHaveProperty('mtgData');
    });

    it('should handle empty array', () => {
      const result = exportToJSON([]);
      const parsed = JSON.parse(result);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });
  });

  describe('exportToDeckbox', () => {
    it('should export cards to Deckbox format', () => {
      const result = exportToDeckbox(mockCards);
      
      expect(result).toContain('Name,Count,Edition');
      expect(result).toContain('Lightning Bolt,4');
      expect(result).toContain('Black Lotus,1');
    });

    it('should include all required Deckbox columns', () => {
      const result = exportToDeckbox(mockCards);
      const lines = result.split('\n');
      const header = lines[0];
      
      expect(header).toContain('Name');
      expect(header).toContain('Count');
      expect(header).toContain('Edition');
      expect(header).toContain('Card Number');
      expect(header).toContain('Condition');
    });
  });

  describe('exportToMoxfield', () => {
    it('should export cards to Moxfield format', () => {
      const result = exportToMoxfield(mockCards);
      const parsed = JSON.parse(result);
      
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('mainboard');
      expect(parsed).toHaveProperty('format');
      expect(parsed.mainboard).toHaveLength(2);
      expect(parsed.mainboard.find((c: any) => c.card === 'M21:161')?.quantity).toBe(4);
      expect(parsed.mainboard.find((c: any) => c.card === 'LEA:1')?.quantity).toBe(1);
    });

    it('should aggregate cards with same key', () => {
      const duplicateCards: UserCard[] = [
        {
          id: '1',
          name: 'Lightning Bolt',
          quantity: 2,
          setCode: 'M21',
          collectorNumber: '161',
          userId: 'user1',
          createdAt: new Date(),
        },
        {
          id: '2',
          name: 'Lightning Bolt',
          quantity: 2,
          setCode: 'M21',
          collectorNumber: '161',
          userId: 'user1',
          createdAt: new Date(),
        },
      ];
      
      const result = exportToMoxfield(duplicateCards);
      const parsed = JSON.parse(result);
      
      expect(parsed.mainboard[0].quantity).toBe(4);
    });
  });

  describe('exportCollection', () => {
    it('should export in CSV format', () => {
      const result = exportCollection(mockCards, 'csv');
      expect(result).toContain('Name,Quantity');
    });

    it('should export in JSON format', () => {
      const result = exportCollection(mockCards, 'json');
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should export in Deckbox format', () => {
      const result = exportCollection(mockCards, 'deckbox');
      expect(result).toContain('Name,Count,Edition');
    });

    it('should export in Moxfield format', () => {
      const result = exportCollection(mockCards, 'moxfield');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('mainboard');
    });

    it('should throw error for unsupported format', () => {
      expect(() => {
        exportCollection(mockCards, 'invalid' as any);
      }).toThrow("Format d'export non supporté");
    });
  });

  describe('downloadFile', () => {
    beforeEach(() => {
      // Mock URL.createObjectURL et URL.revokeObjectURL
      // @ts-ignore
      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      // @ts-ignore
      global.URL.revokeObjectURL = jest.fn();
      
      // Mock document.createElement et appendChild
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      };
      document.createElement = jest.fn(() => mockLink as any);
      document.body.appendChild = jest.fn();
      document.body.removeChild = jest.fn();
    });

    it('should create and trigger download', () => {
      downloadFile('test content', 'test.csv', 'text/csv');
      
      // @ts-ignore
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
      // @ts-ignore
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });
  });
});

