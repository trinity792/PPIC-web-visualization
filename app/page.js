import { COLORS } from "@/lib/constants";
import PopHousingLineSection from "@/components/charts/PopHousingLineSection";
import ComponentsOfChangeLineSection from "@/components/charts/ComponentsOfChangeLineSection";

export default function Home() {
  return (
    <main
      style={{
        backgroundColor: COLORS.lightGray,
        minHeight: "calc(100vh - 120px)",
        padding: "40px",
      }}
    >
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          color: COLORS.gray7,
          marginBottom: "4px",
        }}
      >
        California Population &amp; Housing
      </h1>
      <p style={{ marginTop: 0, marginBottom: "24px", color: COLORS.gray5 }}>
        Trends from the California Department of Finance E-5 estimates, 1991–2025.
      </p>

      <PopHousingLineSection />

      <section style={{ marginTop: "40px" }}>
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            color: COLORS.gray7,
            marginBottom: "4px",
          }}
        >
          Components of Change
        </h2>
        <p style={{ marginTop: 0, marginBottom: "24px", color: COLORS.gray5 }}>
          Births, deaths, and migration trends from Department of Finance E-6 and Census component estimates.
        </p>

        <ComponentsOfChangeLineSection />
      </section>
    </main>
  );
}
