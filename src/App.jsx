import { useState, useEffect, useRef, useCallback } from "react";

const DATASETS = [
  {
    key: "ecommerce",
    name: "E-commerce Data",
    icon: "🛒",
    file: "gs://multi-data-lake/ecommerce_data.csv",
    partitionLabel0: "orders_shard_0",
    partitionLabel1: "orders_shard_1",
    outputs: [
      "Session Metrics",
      "Funnel Conversion Rates",
      "Marketing Attribution Results",
    ],
  },
  {
    key: "graph",
    name: "Graph Data",
    icon: "🕸️",
    file: "gs://multi-data-lake/graph_data.csv",
    partitionLabel0: "vertices_edges_0",
    partitionLabel1: "vertices_edges_1",
    outputs: ["PageRank Scores", "Community Metrics", "Triangle Metrics"],
  },
  {
    key: "log",
    name: "Log Data",
    icon: "📜",
    file: "gs://multi-data-lake/log_data.json",
    partitionLabel0: "logs_partition_0",
    partitionLabel1: "logs_partition_1",
    outputs: [
      "Latency Percentiles",
      "Deployment Impact Analysis",
      "Anomaly Reports",
    ],
  },
];

const STATUS_COLORS = {
  IDLE: "#8ab4f8",
  WAITING: "#8ab4f8",
  RUNNING: "#34a853",
  DONE: "#fbbc04",
  SENDING: "#fbbc04",
  SHUFFLING: "#a142f4",
};

const initialOutputs = {
  ecommerce: "PENDING",
  graph: "PENDING",
  log: "PENDING",
};

const initialState = () => ({
  phase: "idle",
  datasetIndex: 0,
  currentDatasetName: "Waiting",
  masterStatus: "IDLE",
  worker0Status: "WAITING",
  worker1Status: "WAITING",
  worker0Task: "—",
  worker1Task: "—",
  clusterJobs: 0,
  logs: [],
  outputs: initialOutputs,
  masterToWorkers: "idle",
  workerToMaster: "idle",
  workerToWorker: "idle",
  pipelineProgress: 0,
  completedDatasets: [],
});

function makeOutputs(dataset) {
  if (dataset.key === "ecommerce") return { ecommerce: "READY" };
  if (dataset.key === "graph") return { graph: "READY" };
  return { log: "READY" };
}

function getFlowLabel(direction, mode) {
  if (direction === "masterToWorkers") {
    if (mode === "send") return "Preparing task assignment";
    if (mode === "active") return "Tasks sent to Worker 0 and Worker 1";
    return "No active task assignment";
  }

  if (direction === "workerToWorker") {
    if (mode === "exchange") return "Workers exchanging intermediate data";
    return "No worker-to-worker shuffle";
  }

  if (mode === "active") return "Workers returning processed results to Master";
  return "No active result return";
}

export function __testables__() {
  return {
    makeOutputs,
    getFlowLabel,
    initialState,
    DATASETS,
  };
}

export default function App() {
  const [state, setState] = useState(initialState());
  const [speed, setSpeed] = useState("Normal");
  const intervalRef = useRef(null);
  const stepRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const speedMs =
    speed === "Fast" ? 450 : speed === "Normal" ? 850 : speed === "Slow" ? 1400 : 2200;

  const totalSteps = DATASETS.length * 5;

  const addLog = useCallback((msg) => {
    setState((s) => ({
      ...s,
      logs: [...s.logs, { time: new Date().toLocaleTimeString(), msg }],
    }));
  }, []);

  const stopSim = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetSim = useCallback(() => {
    stopSim();
    stepRef.current = 0;
    setState(initialState());
  }, [stopSim]);

  const runPipelineStep = useCallback(() => {
    const step = stepRef.current;
    const datasetIndex = Math.floor(step / 5);

    if (datasetIndex >= DATASETS.length) {
      stopSim();
      setState((prev) => ({
        ...prev,
        phase: "done",
        currentDatasetName: "All datasets processed",
        masterStatus: "DONE",
        worker0Status: "DONE",
        worker1Status: "DONE",
        worker0Task: "Completed",
        worker1Task: "Completed",
        masterToWorkers: "idle",
        workerToMaster: "idle",
        workerToWorker: "idle",
        pipelineProgress: 100,
      }));
      addLog(
        "✅ Pipeline complete — E-commerce Data, Graph Data, and Log Data were processed sequentially by the Dataproc cluster."
      );
      return;
    }

    const dataset = DATASETS[datasetIndex];
    const subStep = step % 5;
    const progress = Math.round(((step + 1) / totalSteps) * 100);

    switch (subStep) {
      case 0:
        setState((prev) => ({
          ...prev,
          phase: "running",
          datasetIndex,
          currentDatasetName: dataset.name,
          masterStatus: "RUNNING",
          worker0Status: "WAITING",
          worker1Status: "WAITING",
          worker0Task: "Awaiting assignment",
          worker1Task: "Awaiting assignment",
          masterToWorkers: "send",
          workerToMaster: "idle",
          workerToWorker: "idle",
          pipelineProgress: progress,
        }));
        addLog(
          `${dataset.icon} ${dataset.name} loaded from GCP Bucket into Google Dataproc. Spark Driver inspects metadata and prepares distributed task scheduling.`
        );
        break;

      case 1:
        setState((prev) => ({
          ...prev,
          masterStatus: "SENDING",
          worker0Status: "RUNNING",
          worker1Status: "RUNNING",
          worker0Task: `Task assigned: process ${dataset.partitionLabel0}`,
          worker1Task: `Task assigned: process ${dataset.partitionLabel1}`,
          clusterJobs: prev.clusterJobs + 1,
          masterToWorkers: "active",
          workerToMaster: "idle",
          workerToWorker: "idle",
          pipelineProgress: progress,
        }));
        addLog(
          `📤 Master Node → Worker Nodes: Spark Driver assigns ${dataset.name} partitions to Executor 0 and Executor 1 for parallel processing.`
        );
        break;

      case 2:
        setState((prev) => ({
          ...prev,
          masterStatus: "RUNNING",
          worker0Status: "RUNNING",
          worker1Status: "RUNNING",
          worker0Task: `Executing map/filter/aggregate on ${dataset.partitionLabel0}`,
          worker1Task: `Executing map/filter/aggregate on ${dataset.partitionLabel1}`,
          masterToWorkers: "active",
          workerToMaster: "idle",
          workerToWorker: "idle",
          pipelineProgress: progress,
        }));
        addLog(
          `⚙️ Worker Nodes execute tasks independently. Each executor transforms its own ${dataset.name} partition and prepares partial results for cluster-wide aggregation.`
        );
        break;

      case 3:
        setState((prev) => ({
          ...prev,
          worker0Status: "SHUFFLING",
          worker1Status: "SHUFFLING",
          worker0Task: "Sharing partial results / intermediate state",
          worker1Task: "Receiving + merging remote partition state",
          masterToWorkers: "idle",
          workerToMaster: "idle",
          workerToWorker: "exchange",
          pipelineProgress: progress,
        }));
        addLog(
          "🔀 Worker Node ↔ Worker Node: executors exchange intermediate data during Spark shuffle so related keys and graph/log/session features can be merged correctly."
        );
        break;

      case 4: {
        const producedOutputs = makeOutputs(dataset);
        setState((prev) => ({
          ...prev,
          masterStatus: "RUNNING",
          worker0Status: "WAITING",
          worker1Status: "WAITING",
          worker0Task: "Partial results returned to driver",
          worker1Task: "Partial results returned to driver",
          outputs: { ...prev.outputs, ...producedOutputs },
          completedDatasets: [...prev.completedDatasets, dataset.name],
          masterToWorkers: "idle",
          workerToMaster: "active",
          workerToWorker: "idle",
          pipelineProgress: progress,
        }));
        addLog(
          `📥 Worker Nodes → Master Node: executors return processed results. Spark Driver aggregates final outputs for ${dataset.name} and publishes them to Live Metrics.`
        );
        break;
      }

      default:
        break;
    }

    stepRef.current += 1;
  }, [addLog, stopSim, totalSteps]);

  const startSim = useCallback(() => {
    if (stateRef.current.phase === "done") return;
    stopSim();
    intervalRef.current = setInterval(runPipelineStep, speedMs);
  }, [runPipelineStep, speedMs, stopSim]);

  useEffect(() => {
    if (intervalRef.current) {
      stopSim();
      intervalRef.current = setInterval(runPipelineStep, speedMs);
    }
  }, [speedMs, runPipelineStep, stopSim]);

  useEffect(() => () => stopSim(), [stopSim]);

  const logEndRef = useRef(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  const StatusBadge = ({ status }) => (
    <span
      style={{
        display: "inline-block",
        padding: "2px 12px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        letterSpacing: "0.5px",
        background: `${STATUS_COLORS[status] || "#666"}22`,
        color: STATUS_COLORS[status] || "#888",
        border: `1px solid ${STATUS_COLORS[status] || "#666"}55`,
      }}
    >
      {status}
    </span>
  );

  const ProgressBar = ({ value, max, color }) => (
    <div
      style={{
        width: "100%",
        height: 4,
        background: "#2a2a3a",
        borderRadius: 2,
        marginTop: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${(value / max) * 100}%`,
          height: "100%",
          background: color,
          borderRadius: 2,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );

  const cardStyle = {
    background: "linear-gradient(135deg, #1a1a2e 0%, #1e2247 100%)",
    border: "1px solid #2e3566",
    borderRadius: "10px",
    padding: "16px",
    position: "relative",
  };

  const metricCard = {
    background: "#141428",
    border: "1px solid #252550",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "10px",
  };

  const currentDataset = DATASETS[state.datasetIndex] || DATASETS[0];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0f0f23 0%, #1a1a35 40%, #12122a 100%)",
        color: "#c0c8ef",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        fontSize: "13px",
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid #252550",
          background: "#12122aee",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background:
                state.phase === "running"
                  ? "#34a853"
                  : state.phase === "done"
                  ? "#fbbc04"
                  : "#8ab4f8",
              boxShadow: `0 0 10px ${state.phase === "running" ? "#34a853" : "#8ab4f8"}`,
              animation: state.phase === "running" ? "pulse 1.5s infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: "20px",
              fontWeight: 800,
              background: "linear-gradient(90deg, #8ab4f8, #34a853)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "1px",
            }}
          >
            Distributed System Simulator
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <StatusBadge
            status={
              state.phase === "running" ? "RUNNING" : state.phase === "done" ? "DONE" : "IDLE"
            }
          />
          <span style={{ color: "#7a8ab5", fontSize: "13px" }}>
            Current Dataset: {state.currentDatasetName}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px" }}>
        <button
          onClick={startSim}
          disabled={state.phase === "done"}
          style={{
            padding: "8px 22px",
            background:
              state.phase === "done" ? "#2a2a3a" : "linear-gradient(135deg, #4285f4, #8ab4f8)",
            color: state.phase === "done" ? "#556" : "#000",
            border: "none",
            borderRadius: "6px",
            fontWeight: 700,
            fontFamily: "inherit",
            fontSize: "12px",
            cursor: state.phase === "done" ? "not-allowed" : "pointer",
            letterSpacing: "1px",
          }}
        >
          ▶ RUN
        </button>

        <button
          onClick={stopSim}
          style={{
            padding: "8px 18px",
            background: "transparent",
            color: "#ea4335",
            border: "1px solid #ea433544",
            borderRadius: "6px",
            fontWeight: 700,
            fontFamily: "inherit",
            fontSize: "12px",
            cursor: "pointer",
            letterSpacing: "1px",
          }}
        >
          ■ STOP
        </button>

        <button
          onClick={resetSim}
          style={{
            padding: "8px 18px",
            background: "#1a1a2e",
            color: "#8a9ad0",
            border: "1px solid #2e3566",
            borderRadius: "6px",
            fontWeight: 700,
            fontFamily: "inherit",
            fontSize: "12px",
            cursor: "pointer",
            letterSpacing: "1px",
          }}
        >
          ↻ RESET
        </button>

        <span style={{ color: "#5a6a9a", marginLeft: 8 }}>Speed:</span>

        <select
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
          style={{
            background: "#1a1a2e",
            color: "#8ab4f8",
            border: "1px solid #2e3566",
            borderRadius: "4px",
            padding: "4px 8px",
            fontFamily: "inherit",
            fontSize: "12px",
          }}
        >
          <option>Very Slow</option>
          <option>Slow</option>
          <option>Normal</option>
          <option>Fast</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 0, padding: "16px 24px" }}>
        <div style={{ flex: "1 1 62%", minWidth: 0 }}>
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 30 }}>☁️</div>
                <div>
                  <div style={{ fontWeight: 700, color: "#e0eaf5", fontSize: 14 }}>GCP Bucket</div>
                  <div style={{ color: "#7a8ab5", fontSize: 11, marginTop: 2 }}>
                    Three datasets are stored and sent to Dataproc one by one.
                  </div>
                </div>
              </div>
              <div style={{ color: "#8ab4f8", fontSize: 11 }}>Sequential feed enabled</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {DATASETS.map((dataset, index) => {
                const isActive = state.datasetIndex === index && state.phase !== "done";
                const isCompleted = state.completedDatasets.includes(dataset.name);

                return (
                  <div
                    key={dataset.key}
                    style={{
                      background: isActive ? "#1e2d4d" : "#141428",
                      border: `1px solid ${
                        isActive ? "#4285f4" : isCompleted ? "#34a85366" : "#2e3566"
                      }`,
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>{dataset.icon}</span>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#e0eaf5" }}>
                        {dataset.name}
                      </div>
                    </div>

                    <div style={{ color: "#7a8ab5", fontSize: 10 }}>{dataset.file}</div>

                    <div style={{ marginTop: 8 }}>
                      <StatusBadge
                        status={isCompleted ? "DONE" : isActive ? "RUNNING" : "WAITING"}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(135deg, #12122a 0%, #1a1a38 100%)",
              border: "1px solid #2e3566",
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🔷</span>
                <span
                  style={{
                    color: "#8ab4f8",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  GOOGLE DATAPROC CLUSTER
                </span>
              </div>
              <span style={{ color: "#5a6a8a", fontSize: 10 }}>Distributed computing system</span>
            </div>

            <div style={{ ...cardStyle, marginBottom: 14, border: "1px solid #4285f444" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>🧠</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: "#e0eaf5", fontSize: 14 }}>
                      Master Node
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: "#6a7aaa",
                        background: "#4285f415",
                        padding: "1px 8px",
                        borderRadius: 4,
                        border: "1px solid #4285f433",
                      }}
                    >
                      Spark Driver / Task Scheduler
                    </span>
                  </div>

                  <div style={{ color: "#7a8ab5", fontSize: 11, marginTop: 3 }}>
                    Responsible for receiving each dataset, splitting work, assigning tasks, and
                    aggregating outputs.
                  </div>

                  <ProgressBar value={state.pipelineProgress} max={100} color="#4285f4" />
                </div>

                <div>
                  <StatusBadge status={state.masterStatus} />
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#141428",
                border: "1px solid #252550",
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  color: "#8ab4f8",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                COMMUNICATION FLOW CHART
              </div>

              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <div
                  style={{
                    background: "#1e2247",
                    border: "1px solid #4285f444",
                    borderRadius: 10,
                    padding: "10px 18px",
                    minWidth: 180,
                    textAlign: "center",
                  }}
                >
                  <div style={{ color: "#e0eaf5", fontSize: 12, fontWeight: 700 }}>
                    Master Node
                  </div>
                  <div style={{ color: "#7a8ab5", fontSize: 10, marginTop: 4 }}>
                    {getFlowLabel("masterToWorkers", state.masterToWorkers)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  color: state.masterToWorkers === "idle" ? "#4a5a8a" : "#fbbc04",
                  fontSize: 12,
                  marginBottom: 10,
                  fontWeight: 700,
                }}
              >
                ↓ Master → Workers
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 14,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    background: "#1a1a2e",
                    border: "1px solid #34a85344",
                    borderRadius: 10,
                    padding: "10px 14px",
                    minWidth: 150,
                    textAlign: "center",
                  }}
                >
                  <div style={{ color: "#e0eaf5", fontSize: 12, fontWeight: 700 }}>
                    Worker Node 0
                  </div>
                  <div style={{ color: "#7a8ab5", fontSize: 10, marginTop: 4 }}>
                    Executes assigned task
                  </div>
                </div>

                <div
                  style={{
                    color: state.workerToWorker === "idle" ? "#4a5a8a" : "#a142f4",
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  ↔ Worker ↔ Worker
                  <div style={{ fontSize: 10, marginTop: 4, fontWeight: 500 }}>
                    {getFlowLabel("workerToWorker", state.workerToWorker)}
                  </div>
                </div>

                <div
                  style={{
                    background: "#1a1a2e",
                    border: "1px solid #34a85344",
                    borderRadius: 10,
                    padding: "10px 14px",
                    minWidth: 150,
                    textAlign: "center",
                  }}
                >
                  <div style={{ color: "#e0eaf5", fontSize: 12, fontWeight: 700 }}>
                    Worker Node 1
                  </div>
                  <div style={{ color: "#7a8ab5", fontSize: 10, marginTop: 4 }}>
                    Executes assigned task
                  </div>
                </div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  color: state.workerToMaster === "idle" ? "#4a5a8a" : "#34a853",
                  fontSize: 12,
                  marginTop: 12,
                  fontWeight: 700,
                }}
              >
                ↑ Workers → Master
              </div>

              <div style={{ textAlign: "center", color: "#7a8ab5", fontSize: 10, marginTop: 4 }}>
                {getFlowLabel("workerToMaster", state.workerToMaster)}
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
              <div style={{ ...cardStyle, flex: 1, border: "1px solid #34a85344" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26, marginBottom: 4 }}>⚙️</div>
                  <div style={{ fontWeight: 700, color: "#e0eaf5", fontSize: 13 }}>
                    Worker Node 0
                  </div>

                  <div
                    style={{
                      fontSize: 9,
                      color: "#6a7aaa",
                      background: "#34a85315",
                      padding: "1px 8px",
                      borderRadius: 4,
                      border: "1px solid #34a85333",
                      display: "inline-block",
                      marginTop: 4,
                    }}
                  >
                    Spark Executor
                  </div>

                  <div style={{ color: "#7a8ab5", fontSize: 10, marginTop: 8 }}>
                    Current dataset slice: {currentDataset.partitionLabel0}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <StatusBadge status={state.worker0Status} />
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "#8fa0d8",
                      fontSize: 11,
                      lineHeight: 1.5,
                    }}
                  >
                    {state.worker0Task}
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, flex: 1, border: "1px solid #34a85344" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26, marginBottom: 4 }}>⚙️</div>
                  <div style={{ fontWeight: 700, color: "#e0eaf5", fontSize: 13 }}>
                    Worker Node 1
                  </div>

                  <div
                    style={{
                      fontSize: 9,
                      color: "#6a7aaa",
                      background: "#34a85315",
                      padding: "1px 8px",
                      borderRadius: 4,
                      border: "1px solid #34a85333",
                      display: "inline-block",
                      marginTop: 4,
                    }}
                  >
                    Spark Executor
                  </div>

                  <div style={{ color: "#7a8ab5", fontSize: 10, marginTop: 8 }}>
                    Current dataset slice: {currentDataset.partitionLabel1}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <StatusBadge status={state.worker1Status} />
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "#8fa0d8",
                      fontSize: 11,
                      lineHeight: 1.5,
                    }}
                  >
                    {state.worker1Task}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            flex: "0 0 360px",
            marginLeft: 20,
            background: "#12122a",
            border: "1px solid #252550",
            borderRadius: 10,
            padding: "16px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              color: "#5a6a9a",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "2px",
              marginBottom: 14,
            }}
          >
            {"// LIVE METRICS"}
          </div>

          <div style={metricCard}>
            <div style={{ color: "#7a8ab5", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
              CURRENT DATASET
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#34a853" }}>
              {state.currentDatasetName}
            </div>
          </div>

          <div style={metricCard}>
            <div style={{ color: "#7a8ab5", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
              CLUSTER JOBS
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#8ab4f8" }}>
              {state.clusterJobs}
            </div>
          </div>

          <div style={{ ...metricCard, borderColor: "#2f4f7a" }}>
            <div style={{ color: "#8ab4f8", fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>
              OUTPUT STATUS
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "#d7dffa", fontSize: 11 }}>E-commerce Data Output</span>
                <StatusBadge status={state.outputs.ecommerce === "READY" ? "DONE" : "WAITING"} />
              </div>
              <div style={{ color: "#7a8ab5", fontSize: 10 }}>
                Session Metrics · Funnel Conversion Rates · Marketing Attribution Results
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 4,
                }}
              >
                <span style={{ color: "#d7dffa", fontSize: 11 }}>Graph Data Output</span>
                <StatusBadge status={state.outputs.graph === "READY" ? "DONE" : "WAITING"} />
              </div>
              <div style={{ color: "#7a8ab5", fontSize: 10 }}>
                PageRank Scores · Community Metrics · Triangle Metrics
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 4,
                }}
              >
                <span style={{ color: "#d7dffa", fontSize: 11 }}>Log Data Output</span>
                <StatusBadge status={state.outputs.log === "READY" ? "DONE" : "WAITING"} />
              </div>
              <div style={{ color: "#7a8ab5", fontSize: 10 }}>
                Latency Percentiles · Deployment Impact Analysis · Anomaly Reports
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          margin: "0 24px 24px",
          background: "#12122a",
          border: "1px solid #252550",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: "1px solid #252550",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#34a853",
                boxShadow: "0 0 6px #34a853",
              }}
            />
            <span
              style={{
                color: "#7a8ab5",
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: 700,
              }}
            >
              SYSTEM LOG
            </span>
          </div>

          <button
            onClick={() => setState((s) => ({ ...s, logs: [] }))}
            style={{
              background: "#1a1a2e",
              color: "#7a8ab5",
              border: "1px solid #2e3566",
              borderRadius: 4,
              padding: "3px 12px",
              fontFamily: "inherit",
              fontSize: 10,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            CLEAR
          </button>
        </div>

        <div
          style={{
            height: 160,
            overflowY: "auto",
            padding: "8px 16px",
            fontSize: 11,
            lineHeight: 1.7,
          }}
        >
          {state.logs.length === 0 && (
            <div style={{ color: "#3a4a6a", fontStyle: "italic" }}>
              Waiting for sequential dataset processing to start...
            </div>
          )}

          {state.logs.map((l, i) => (
            <div key={i} style={{ color: "#8a9ad0" }}>
              <span style={{ color: "#4a5a8a", marginRight: 8 }}>[{l.time}]</span>
              {l.msg}
            </div>
          ))}

          <div ref={logEndRef} />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #12122a; }
        ::-webkit-scrollbar-thumb { background: #2e3566; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3e4576; }
      `}</style>
    </div>
  );
}