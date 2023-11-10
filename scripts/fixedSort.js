/**
 * A collection of functions related to sorting objects within a parent container.
 */
export class SortingHelpersFixed {
  /**
   * Given a source object to sort, a target to sort relative to, and an Array of siblings in the container:
   * Determine the updated sort keys for the source object, or all siblings if a reindex is required.
   * Return an Array of updates to perform, it is up to the caller to dispatch these updates.
   * Each update is structured as:
   * {
   *   target: object,
   *   update: {sortKey: sortValue}
   * }
   *
   * @param {object} source       The source object being sorted
   * @param {object} [options]    Options which modify the sort behavior
   * @param {object|null} [options.target]  The target object relative which to sort
   * @param {object[]} [options.siblings]   The Array of siblings which the source should be sorted within
   * @param {string} [options.sortKey=sort] The property name within the source object which defines the sort key
   * @param {boolean} [options.sortBefore]  Explicitly sort before (true) or sort after( false).
   *                                        If undefined the sort order will be automatically determined.
   * @returns {object[]}          An Array of updates for the caller of the helper function to perform
   */
  static performIntegerSort(
    source,
    { target = null, siblings = [], sortKey = 'sort', sortBefore } = {}
  ) {
    // Automatically determine the sorting direction
    if (sortBefore === undefined) {
      sortBefore = (source[sortKey] || 0) > (target?.[sortKey] || 0);
    }

    // Ensure the siblings are sorted
    siblings = Array.from(siblings);
    siblings.sort((a, b) => a[sortKey] - b[sortKey]);

    // Determine the index target for the sort
    let defaultIdx = sortBefore ? siblings.length : 0;
    let idx = target ? siblings.findIndex((sib) => sib === target) : defaultIdx;

    // Determine the indices to sort between
    let min, max;
    if (sortBefore) [min, max] = this._sortBefore(siblings, idx, sortKey);
    else [min, max] = this._sortAfter(siblings, idx, sortKey);

    // Easiest case - no siblings
    if (siblings.length === 0) {
      return [
        {
          target: source,
          update: { [sortKey]: CONST.SORT_INTEGER_DENSITY },
        },
      ];
    }

    // No minimum - sort to beginning
    else if (Number.isFinite(max) && min === null) {
      return [
        {
          target: source,
          update: { [sortKey]: max - CONST.SORT_INTEGER_DENSITY },
        },
      ];
    }

    // No maximum - sort to end
    else if (Number.isFinite(min) && max === null) {
      return [
        {
          target: source,
          update: { [sortKey]: min + CONST.SORT_INTEGER_DENSITY },
        },
      ];
    }

    // Sort between two
    else if (Number.isFinite(min) && Number.isFinite(max) && Math.abs(max - min) > 1) {
      return [
        {
          target: source,
          update: { [sortKey]: Math.round(0.5 * (min + max)) },
        },
      ];
    }

    // Reindex all siblings
    else {
      siblings.splice(idx + (sortBefore ? 0 : 1), 0, source);
      return siblings.map((sib, i) => {
        return {
          target: sib,
          update: { [sortKey]: (i + 1) * CONST.SORT_INTEGER_DENSITY },
        };
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Given an ordered Array of siblings and a target position, return the [min,max] indices to sort before the target
   * @private
   */
  static _sortBefore(siblings, idx, sortKey) {
    let max = siblings[idx] ? siblings[idx][sortKey] : null;
    let min = siblings[idx - 1] ? siblings[idx - 1][sortKey] : null;
    return [min, max];
  }

  /* -------------------------------------------- */

  /**
   * Given an ordered Array of siblings and a target position, return the [min,max] indices to sort after the target
   * @private
   */
  static _sortAfter(siblings, idx, sortKey) {
    let min = siblings[idx] ? siblings[idx][sortKey] : null;
    let max = siblings[idx + 1] ? siblings[idx + 1][sortKey] : null;
    return [min, max];
  }

  /* -------------------------------------------- */
}
