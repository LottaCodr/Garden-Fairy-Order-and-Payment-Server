import { assertMongoUri } from '@src/db';


/******************************************************************************
                                Run
******************************************************************************/

describe('assertMongoUri', () => {
  it('accepts a valid mongodb:// uri', () => {
    const uri = 'mongodb://localhost:27017/garden-fairy';
    expect(assertMongoUri(uri)).toBe(uri);
  });

  it('accepts a valid mongodb+srv:// uri and trims whitespace', () => {
    const uri = 'mongodb+srv://user:pass@cluster.abcde.mongodb.net/db';
    expect(assertMongoUri(`  ${uri}  `)).toBe(uri);
  });

  it('rejects a missing uri', () => {
    expect(() => assertMongoUri(undefined)).toThrow(/MONGO_URI is not set/);
    expect(() => assertMongoUri('')).toThrow(/MONGO_URI is not set/);
    expect(() => assertMongoUri('   ')).toThrow(/MONGO_URI is not set/);
  });

  it('rejects the config-file placeholder', () => {
    expect(() => assertMongoUri('your_production_mongo_uri'))
      .toThrow(/still the placeholder/);
    expect(() => assertMongoUri('your-mongo-uri'))
      .toThrow(/still the placeholder/);
  });

  it('rejects a uri with an invalid scheme', () => {
    expect(() => assertMongoUri('postgres://localhost:5432/db'))
      .toThrow(/must start with "mongodb/);
    expect(() => assertMongoUri('not-a-uri'))
      .toThrow(/must start with "mongodb/);
  });
});
