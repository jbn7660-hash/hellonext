/**
 * Scaffolding test for H2: DFS visited-set bug in reverseTraverse.
 *
 * Goal: Reproduce cycles that sneak past detectCycles when the traversal
 * clones the visited set per branch. Once reverseTraverse is exported,
 * switch `ignore` to `false` and replace the placeholder mock with a real
 * supabase client stub plus sample DAG fixtures.
 */
Deno.test({
  name: 'reverseTraverse should reuse a shared visited set (scaffold)',
  ignore: true,
  fn: async () => {
    // TODO: Inject a supabase mock that returns a cyclic DAG (A->B->C->A)
    // and assert that traversal halts instead of recursing forever.
    // Use this harness to guard against regressions when fixing H2.
  },
});
