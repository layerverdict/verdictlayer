export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-4 rounded-full border border-border px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
        Built on 0G
      </span>
      <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
        Verdict
      </h1>
      <p className="mb-8 max-w-xl text-lg text-muted-foreground">
        A verifiable AI assertion layer. One primitive. TEE-attested judges.
        On-chain enforcement.
      </p>
      <p className="text-sm text-muted-foreground">
        Scaffold live. Protocol lands Day 3.
      </p>
    </main>
  );
}
