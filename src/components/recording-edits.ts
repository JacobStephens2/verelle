export interface RecordingEditSnapshot<Field> {
  readonly fields: ReadonlySet<Field>;
  readonly revisions: ReadonlyMap<Field, number>;
}

export interface RecordingEdits<Field> {
  /** Marks fields at one new edit revision and returns every pending field. */
  readonly mark: (fields: readonly Field[]) => ReadonlySet<Field>;

  /** Starts a save without preventing later edits. */
  readonly snapshot: () => RecordingEditSnapshot<Field>;

  /** Settles only fields that have not been edited again since the snapshot. */
  readonly settle: (snapshot: RecordingEditSnapshot<Field>) => ReadonlySet<Field>;

  /** Starts a new editor session. */
  readonly reset: () => ReadonlySet<Field>;
}

/** Tracks field revisions so a completed save cannot erase newer input. */
export function createRecordingEdits<Field>(): RecordingEdits<Field> {
  const revisions = new Map<Field, number>();
  let nextRevision = 0;

  const fields = (): ReadonlySet<Field> => new Set(revisions.keys());

  return {
    mark: (changedFields) => {
      nextRevision += 1;
      for (const field of changedFields) revisions.set(field, nextRevision);
      return fields();
    },
    snapshot: () => ({
      fields: fields(),
      revisions: new Map(revisions),
    }),
    settle: (snapshot) => {
      for (const [field, savedRevision] of snapshot.revisions) {
        if (revisions.get(field) === savedRevision) revisions.delete(field);
      }
      return fields();
    },
    reset: () => {
      revisions.clear();
      return fields();
    },
  };
}
