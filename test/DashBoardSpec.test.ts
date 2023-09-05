import { Spec } from "../src";

test("dashboardSpec", () => {
  expect(
    new Spec().create({
      title: "Example-Dashboard",
      widgets: [
        {
          definition: {
            title: "Metrics HOP",
            titleSize: "16",
            titleAlign: "left",
            showLegend: false,
            type: "distribution",
            customLinks: [
              {
                label: "Example",
                link: "https://example.org/",
              },
            ],
            xaxis: {
              max: "auto",
              includeZero: true,
              scale: "linear",
              min: "auto",
            },
            yaxis: {
              max: "auto",
              includeZero: true,
              scale: "linear",
              min: "auto",
            },
            requests: [
              {
                query: {
                  query: "histogram:trace.Load{*}",
                  dataSource: "metrics",
                  name: "query1",
                },
                requestType: "histogram",
                style: {
                  palette: "dog_classic",
                },
              },
            ],
          },
          layout: {
            x: 0,
            y: 0,
            width: 4,
            height: 2,
          },
        },
      ],
      layoutType: "ordered",
    }),
  ).toMatchSnapshot();
});
