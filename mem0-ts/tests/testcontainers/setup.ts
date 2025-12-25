/**
 * Testcontainers setup for mem0 integration tests.
 *
 * Provides a complete e2e environment with:
 * - Memgraph (graph store - Neo4j Bolt compatible)
 * - PostgreSQL + pgvector (vector store)
 * - Ollama (LLM + embeddings) - can use host Ollama via OLLAMA_HOST env var
 *
 * Environment variables:
 * - OLLAMA_HOST: If set, use host Ollama instead of container (e.g., "http://localhost:11434")
 * - OLLAMA_LLM_MODEL: LLM model to use (default: "smollm:360m")
 * - OLLAMA_EMBED_MODEL: Embedding model to use (default: "all-minilm:22m")
 * - EMBEDDING_DIMS: Embedding dimensions (default: 384, must match model)
 */

import {
  GenericContainer,
  Network,
  StartedNetwork,
  StartedTestContainer,
  Wait,
} from "testcontainers";

export interface TestEnvironment {
  network: StartedNetwork;
  memgraph: StartedTestContainer;
  postgres: StartedTestContainer;
  ollama: StartedTestContainer | null; // null when using host Ollama
  config: MemoryTestConfig;
  cleanup: () => Promise<void>;
}

export interface MemoryTestConfig {
  llm: {
    provider: "ollama";
    config: {
      model: string;
      ollamaBaseUrl: string;
      temperature: number;
    };
  };
  embedder: {
    provider: "ollama";
    config: {
      model: string;
      ollamaBaseUrl: string;
      embeddingDims: number;
    };
  };
  vectorStore: {
    provider: "pgvector";
    config: {
      host: string;
      port: number;
      user: string;
      password: string;
      dbname: string;
      collectionName: string;
      embeddingModelDims: number;
    };
  };
  graphStore: {
    provider: "neo4j";
    config: {
      url: string;
      username: string;
      password: string;
    };
  };
  enableGraph: boolean;
  disableHistory: boolean;
}

// Configurable via env vars for CI caching
const OLLAMA_LLM_MODEL = process.env.OLLAMA_LLM_MODEL || "smollm:360m";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "all-minilm:22m";
const EMBEDDING_DIMS = parseInt(process.env.EMBEDDING_DIMS || "384", 10);
const OLLAMA_HOST = process.env.OLLAMA_HOST; // If set, use host Ollama instead of container

/**
 * Start the complete test environment.
 */
export async function startTestEnvironment(): Promise<TestEnvironment> {
  console.log("Creating test network...");
  const network = await new Network().start();

  // Start database containers in parallel
  console.log("Starting database containers...");

  const [memgraph, postgres] = await Promise.all([
    // Memgraph (Neo4j Bolt compatible)
    new GenericContainer("memgraph/memgraph:latest")
      .withNetwork(network)
      .withNetworkAliases("memgraph")
      .withExposedPorts(7687)
      .withWaitStrategy(Wait.forLogMessage(/You are connected/))
      .start()
      .then((container) => {
        console.log("Memgraph started");
        return container;
      }),

    // PostgreSQL + pgvector
    new GenericContainer("ankane/pgvector:latest")
      .withNetwork(network)
      .withNetworkAliases("postgres")
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "postgres",
      })
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/),
      )
      .start()
      .then((container) => {
        console.log("PostgreSQL + pgvector started");
        return container;
      }),
  ]);

  // Ollama: use host if OLLAMA_HOST is set, otherwise start container
  let ollamaUrl: string;
  let ollama: StartedTestContainer | null = null;

  if (OLLAMA_HOST) {
    console.log(`Using host Ollama at ${OLLAMA_HOST}`);
    ollamaUrl = OLLAMA_HOST;
  } else {
    console.log("Starting Ollama container...");
    ollama = await new GenericContainer("ollama/ollama:latest")
      .withNetwork(network)
      .withNetworkAliases("ollama")
      .withExposedPorts(11434)
      .withWaitStrategy(Wait.forHttp("/api/tags", 11434).forStatusCode(200))
      .start();
    console.log("Ollama started");

    ollamaUrl = `http://${ollama.getHost()}:${ollama.getMappedPort(11434)}`;

    // Pull models sequentially (Ollama can't handle parallel pulls well)
    console.log(`Pulling ${OLLAMA_LLM_MODEL}...`);
    const pullLlm = await ollama.exec(["ollama", "pull", OLLAMA_LLM_MODEL]);
    if (pullLlm.exitCode !== 0) {
      console.error(`Failed to pull ${OLLAMA_LLM_MODEL}:`, pullLlm.output);
      throw new Error(`Failed to pull ${OLLAMA_LLM_MODEL}`);
    }
    console.log(`${OLLAMA_LLM_MODEL} pulled successfully`);

    console.log(`Pulling ${OLLAMA_EMBED_MODEL}...`);
    const pullEmbed = await ollama.exec(["ollama", "pull", OLLAMA_EMBED_MODEL]);
    if (pullEmbed.exitCode !== 0) {
      console.error(`Failed to pull ${OLLAMA_EMBED_MODEL}:`, pullEmbed.output);
      throw new Error(`Failed to pull ${OLLAMA_EMBED_MODEL}`);
    }
    console.log(`${OLLAMA_EMBED_MODEL} pulled successfully`);
  }
  const postgresHost = postgres.getHost();
  const postgresPort = postgres.getMappedPort(5432);
  const memgraphHost = memgraph.getHost();
  const memgraphPort = memgraph.getMappedPort(7687);

  const config: MemoryTestConfig = {
    llm: {
      provider: "ollama",
      config: {
        model: OLLAMA_LLM_MODEL,
        ollamaBaseUrl: ollamaUrl,
        temperature: 0.2,
      },
    },
    embedder: {
      provider: "ollama",
      config: {
        model: OLLAMA_EMBED_MODEL,
        ollamaBaseUrl: ollamaUrl,
        embeddingDims: EMBEDDING_DIMS,
      },
    },
    vectorStore: {
      provider: "pgvector",
      config: {
        host: postgresHost,
        port: postgresPort,
        user: "postgres",
        password: "postgres",
        dbname: "mem0_test",
        collectionName: "memories",
        embeddingModelDims: EMBEDDING_DIMS,
      },
    },
    graphStore: {
      provider: "neo4j",
      config: {
        url: `bolt://${memgraphHost}:${memgraphPort}`,
        username: "",
        password: "",
      },
    },
    enableGraph: true,
    disableHistory: true,
  };

  console.log("Test environment ready");
  console.log(`  Ollama: ${ollamaUrl}`);
  console.log(`  PostgreSQL: ${postgresHost}:${postgresPort}`);
  console.log(`  Memgraph: bolt://${memgraphHost}:${memgraphPort}`);

  const cleanup = async () => {
    console.log("Cleaning up test environment...");
    const stopPromises = [postgres.stop(), memgraph.stop()];
    if (ollama) {
      stopPromises.push(ollama.stop());
    }
    await Promise.all(stopPromises);
    await network.stop();
  };

  return {
    network,
    memgraph,
    postgres,
    ollama,
    config,
    cleanup,
  };
}

/**
 * Start a minimal environment with just Ollama and in-memory vector store.
 * Useful for faster tests that don't need persistence or graphs.
 */
export async function startMinimalEnvironment(): Promise<{
  ollama: StartedTestContainer | null;
  config: Omit<MemoryTestConfig, "graphStore" | "vectorStore"> & {
    vectorStore: { provider: "memory"; config: { collectionName: string } };
  };
  cleanup: () => Promise<void>;
}> {
  console.log("Starting minimal test environment...");

  let ollamaUrl: string;
  let ollama: StartedTestContainer | null = null;

  if (OLLAMA_HOST) {
    console.log(`Using host Ollama at ${OLLAMA_HOST}`);
    ollamaUrl = OLLAMA_HOST;
  } else {
    ollama = await new GenericContainer("ollama/ollama:latest")
      .withExposedPorts(11434)
      .withWaitStrategy(Wait.forHttp("/api/tags", 11434).forStatusCode(200))
      .start();

    console.log("Ollama started");

    ollamaUrl = `http://${ollama.getHost()}:${ollama.getMappedPort(11434)}`;

    // Pull models
    console.log(`Pulling ${OLLAMA_LLM_MODEL}...`);
    await ollama.exec(["ollama", "pull", OLLAMA_LLM_MODEL]);
    console.log(`Pulling ${OLLAMA_EMBED_MODEL}...`);
    await ollama.exec(["ollama", "pull", OLLAMA_EMBED_MODEL]);
  }

  const config = {
    llm: {
      provider: "ollama" as const,
      config: {
        model: OLLAMA_LLM_MODEL,
        ollamaBaseUrl: ollamaUrl,
        temperature: 0.2,
      },
    },
    embedder: {
      provider: "ollama" as const,
      config: {
        model: OLLAMA_EMBED_MODEL,
        ollamaBaseUrl: ollamaUrl,
        embeddingDims: EMBEDDING_DIMS,
      },
    },
    vectorStore: {
      provider: "memory" as const,
      config: {
        collectionName: "test_memories",
      },
    },
    enableGraph: false,
    disableHistory: true,
  };

  console.log(`Minimal environment ready at ${ollamaUrl}`);

  return {
    ollama,
    config,
    cleanup: async () => {
      console.log("Cleaning up...");
      if (ollama) {
        await ollama.stop();
      }
    },
  };
}
