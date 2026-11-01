// Runs in every integration test file (vitest.config.mts).
import { afterAll } from "vitest";

import { closeAdminDatabase } from "./admin";

afterAll(closeAdminDatabase);
