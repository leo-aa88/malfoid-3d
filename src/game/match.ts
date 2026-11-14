/*
 * A campaign duel is a match: best of three rounds, the first to two round wins takes it.
 * Only the match's result counts for the campaign (a spell learned, or a life lost); a lost
 * round on the way costs nothing.
 */

/** rounds in a match, and the round wins that take it */
export const MATCH = { bestOf: 3, toWin: 2 };

export type RoundOutcome = {
  /** the round just played (1-based) */
  round: number;
  /** true once someone has the round wins to take the match */
  decided: boolean;
  /** who took the match (only when decided) */
  malfoidWon: boolean | null;
};

export class Match {
  malfoidWins = 0;
  opponentWins = 0;

  /** the round being played (1-based) */
  get round(): number {
    return this.malfoidWins + this.opponentWins + 1;
  }

  /** the deciding round (each side one round win away) */
  get final(): boolean {
    return this.malfoidWins === MATCH.toWin - 1 && this.opponentWins === MATCH.toWin - 1;
  }

  get decided(): boolean {
    return this.malfoidWins >= MATCH.toWin || this.opponentWins >= MATCH.toWin;
  }

  /** a round ended: who won it, and whether that settles the match */
  record(malfoidWon: boolean): RoundOutcome {
    const round = this.round;
    if (!this.decided) {
      if (malfoidWon) this.malfoidWins++;
      else this.opponentWins++;
    }
    const decided = this.decided;
    return { round, decided, malfoidWon: decided ? this.malfoidWins > this.opponentWins : null };
  }

  /** a new match: no rounds played */
  reset(): void {
    this.malfoidWins = this.opponentWins = 0;
  }
}
