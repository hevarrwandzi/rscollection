const test = require('node:test');
const assert = require('node:assert/strict');

test('Database Migrations (migrate.js runner)', async (t) => {
  const queries = [];

  // Mock pg module in require.cache
  const pgMock = {
    Pool: class {
      constructor(config) {
        this.config = config;
      }
      async connect() {
        return {
          query: async (queryText, params) => {
            queries.push({ text: queryText, params });
            if (queryText.includes('SELECT version FROM schema_migrations')) {
              // Mock that 001_init.sql has already run, but 002_seed.sql has not
              return { rows: [{ version: '001_init.sql' }] };
            }
            return { rows: [] };
          },
          release: () => {}
        };
      }
      async end() {}
    }
  };

  const pgPath = require.resolve('pg');
  require.cache[pgPath] = {
    id: pgPath,
    filename: pgPath,
    loaded: true,
    exports: pgMock
  };

  // Intercept process.exit to prevent the migration runner from halting test execution
  const originalExit = process.exit;
  let exitCode = null;
  process.exit = (code) => {
    exitCode = code;
  };

  t.after(() => {
    process.exit = originalExit;
    delete require.cache[pgPath];
    delete require.cache[require.resolve('../scripts/migrate.js')];
  });

  // Execute the migration runner script
  require('../scripts/migrate.js');

  // Wait for async execution of migrations
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Assertions
  assert.equal(exitCode, null); // runner completed successfully

  // Verify that it queried migration version history
  const selectQuery = queries.find(q => q.text.includes('SELECT version FROM schema_migrations'));
  assert.ok(selectQuery);

  // Verify that 001_init.sql was skipped
  const runInit = queries.find(q => q.params && q.params[0] === '001_init.sql');
  assert.equal(runInit, undefined);

  // Verify that 002_seed.sql was run and recorded
  const runSeed = queries.find(q => q.params && q.params[0] === '002_seed.sql');
  assert.ok(runSeed);
});
