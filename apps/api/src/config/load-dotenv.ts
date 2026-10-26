// Side-effect import: must be the first import of an entrypoint, because some
// modules call loadEnv() at import time (before bootstrap code runs).
import { loadDotEnvFile } from './dotenv';

loadDotEnvFile();
