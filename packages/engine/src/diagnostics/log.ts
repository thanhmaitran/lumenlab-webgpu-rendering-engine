import { Emitter } from "../core/emitter";
import type { DiagnosticEntry, DiagnosticSeverity } from "./types";

/** Bounded in-memory diagnostic log (GPU errors, device loss, capability notes). */
export class DiagnosticsLog {
  private entries: DiagnosticEntry[] = [];
  readonly onEntry = new Emitter<DiagnosticEntry>();

  constructor(private readonly maxEntries = 200) {}

  add(severity: DiagnosticSeverity, message: string): DiagnosticEntry {
    const entry: DiagnosticEntry = { timestamp: Date.now(), severity, message };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries)
      this.entries.splice(0, this.entries.length - this.maxEntries);
    this.onEntry.emit(entry);
    return entry;
  }

  list(): readonly DiagnosticEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}
