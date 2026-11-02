// Imprime o hash do código-fonte da composição (usado pelo backend nas chaves de cache).
import { sourceHash } from "./render.mjs";
process.stdout.write(sourceHash());
