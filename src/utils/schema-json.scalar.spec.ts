import { Kind } from 'graphql';
import { SchemaJSON } from './schema-json.scalar';

describe('SchemaJSON scalar', () => {
  describe('parseValue', () => {
    it('accepts a JSON object and returns the trimmed original text', () => {
      const json =
        '{\n  "@context": "https://schema.org",\n  "@type": "Product"\n}';
      expect(SchemaJSON.parseValue(`  ${json}\n`)).toBe(json);
    });

    it('accepts a non-empty array of objects', () => {
      const json = '[{"@type":"Product"},{"@type":"BreadcrumbList"}]';
      expect(SchemaJSON.parseValue(json)).toBe(json);
    });

    it('turns blank input into null so the field is cleared', () => {
      expect(SchemaJSON.parseValue('')).toBeNull();
      expect(SchemaJSON.parseValue('   \n ')).toBeNull();
    });

    it.each([
      ['broken JSON', '{"@type": "Product",', 'not valid JSON'],
      ['a <script> tag', '<script>{}</script>', 'not valid JSON'],
      ['a JSON string', '"hello"', 'object or an array of objects'],
      ['a JSON number', '42', 'object or an array of objects'],
      ['JSON null', 'null', 'object or an array of objects'],
      ['an empty array', '[]', 'object or an array of objects'],
      ['an array with non-objects', '[{}, 1]', 'object or an array of objects'],
    ])('rejects %s', (_, value, message) => {
      expect(() => SchemaJSON.parseValue(value)).toThrow(message);
    });

    it('rejects values that are not strings', () => {
      expect(() => SchemaJSON.parseValue({ '@type': 'Product' })).toThrow(
        'must be sent as a string',
      );
    });
  });

  describe('parseLiteral', () => {
    it('validates inline string literals', () => {
      expect(
        SchemaJSON.parseLiteral({ kind: Kind.STRING, value: '{"a":1}' }),
      ).toBe('{"a":1}');
      expect(() =>
        SchemaJSON.parseLiteral({ kind: Kind.STRING, value: '{' }),
      ).toThrow('not valid JSON');
    });

    it('passes null literals through and rejects other literal kinds', () => {
      expect(SchemaJSON.parseLiteral({ kind: Kind.NULL })).toBeNull();
      expect(() =>
        SchemaJSON.parseLiteral({ kind: Kind.INT, value: '1' }),
      ).toThrow('must be sent as a string');
    });
  });
});
