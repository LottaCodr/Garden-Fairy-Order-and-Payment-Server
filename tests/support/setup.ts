
import { beforeAll, vi } from 'vitest';
import supertest, { Test } from 'supertest';
import TestAgent from 'supertest/lib/agent';

// Mock the mongoose User model BEFORE the app module graph is evaluated so
// tests can run without a MongoDB connection. The async factory imports the
// shared mocks module — both this file and test files reference the same
// mock instances through it.
vi.mock('@src/models/user.model', async () => {
  const { userMocks } = await import('./mocks');
  return {
    User: {
      findById: userMocks.findById,
      findOne: userMocks.findOne,
      findByIdAndUpdate: userMocks.findByIdAndUpdate,
      create: userMocks.create,
    },
  };
});

import app from '@src/server';
import MockOrm from '@src/repos/MockOrm';


/******************************************************************************
                                    Run
******************************************************************************/

let agent: TestAgent<Test>;

beforeAll(async () => {
  agent = supertest.agent(app);
  await MockOrm.cleanDb();
});


/******************************************************************************
                                    Export
******************************************************************************/

export { agent };
