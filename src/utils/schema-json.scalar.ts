import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';

// JSON-LD structured data typed into the dashboard. Stored as the admin's
// original text so formatting and key order survive an edit, but rejected at
// the API boundary unless it parses to a JSON object or an array of objects.
// Blank input is stored as null, which clears the field.

const isPlainObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseSchemaJson = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    throw new GraphQLError('Schema JSON must be sent as a string.');
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new GraphQLError('Schema JSON is not valid JSON.');
  }

  const isObjectArray =
    Array.isArray(parsed) && parsed.length > 0 && parsed.every(isPlainObject);
  if (!isPlainObject(parsed) && !isObjectArray) {
    throw new GraphQLError(
      'Schema JSON must be a JSON object or an array of objects.',
    );
  }

  return trimmed;
};

export const SchemaJSON = new GraphQLScalarType({
  name: 'SchemaJSON',
  description:
    'JSON-LD as a JSON string. Must parse to an object or an array of objects.',
  serialize: (value) => value,
  parseValue: parseSchemaJson,
  parseLiteral: (ast) => {
    if (ast.kind === Kind.NULL) return null;
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('Schema JSON must be sent as a string.');
    }
    return parseSchemaJson(ast.value);
  },
});
