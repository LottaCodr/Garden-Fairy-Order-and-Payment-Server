import { vi } from 'vitest';

/**
 * Shared mock functions for the mongoose User model.
 *
 * Both the `vi.mock` factory in ./setup.ts and individual test files import
 * these from this module, so every consumer sees the same mock instances.
 */
export const userMocks = {
  findById: vi.fn(),
  findOne: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  create: vi.fn(),
};
