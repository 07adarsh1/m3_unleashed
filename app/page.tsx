import Navigation from "@/components/Navigation";
import CinematicExperience from "@/components/CinematicExperience";
import { DesignSection, FinalCTASection, MPowerSection, PerformanceSection, SiteFooter } from "@/components/sections";
import { SCENES } from "@/lib/scenes";

export default function Page() {
  return (
    <>
      <a className="skip-link" href="#performance">
        Skip cinematic intro
      </a>
      <Navigation />
      <main id="top">
        <CinematicExperience />
        {/*
          Linear text alternative of the cinematic chapters (PRD Section 22):
          the visual scenes are opacity/visibility-managed for the scrub mechanic,
          so screen readers get the full content here, in order, instead.
        */}
        <div className="sr-transcript">
          {SCENES.map((scene) => (
            <p key={scene.id}>
              <strong>
                Chapter {scene.order} — {scene.title}. {scene.content.primaryLines.join(" ")}.
              </strong>{" "}
              {scene.content.secondary ?? ""}
              {scene.stats
                ? ` ${scene.stats
                    .map((s) => `${s.value.toFixed(s.decimals ?? 0)} ${s.unit} — ${s.label}.`)
                    .join(" ")}`
                : ""}
              {scene.content.cta ? ` ${scene.content.cta}.` : ""}
            </p>
          ))}
        </div>
        <PerformanceSection />
        <DesignSection />
        <MPowerSection />
        <FinalCTASection />
      </main>
      <SiteFooter />
    </>
  );
}
