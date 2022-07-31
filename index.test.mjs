import { test } from "node:test";
import assert from "assert";

const input = [
  {
    type: "Feature",
    properties: {
      x: 1,
    },
    geometry: null,
  },
  {
    type: "Feature",
    properties: {
      x: 1,
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [1, 2, 0],
            [3, 4, 0],
            [1, 2, 0],
          ],
          [
            [8, 7, 0],
            [2, 7, 0],
            [8, 7, 0],
          ],
        ],
      ],
    },
  },
  {
    type: "Feature",
    properties: {
      x: 1,
    },
    geometry: {
      type: "GeometryCollection",
      geometries: [
        {
          type: "Point",
          coordinates: [42.32, 24.2, 0],
        },
      ],
    },
  },
  {
    type: "Feature",
    properties: {
      x: 1,
    },
    geometry: {
      type: "Point",
      coordinates: [42.32, 24.2, 0],
    },
  },
  {
    type: "Feature",
    properties: {
      x: 1,
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [1, 2, 0],
        [2, 3, 0],
        [3, 4, 0],
      ],
    },
  },
  {
    type: "Feature",
    properties: {
      x: 1,
    },
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [1, 2, 0],
          [3, 4, 0],
        ],
        [
          [8, 7, 0],
          [8, 7, 0],
        ],
      ],
    },
  },
];

// TODO: GeometryCollection?
const GEOMETRY_TYPES = {
  Point: 0,
  MultiPoint: 1,
  LineString: 2,
  MultiLineString: 3,
  Polygon: 4,
  MultiPolygon: 5,
  GeometryCollection: 6,
  None: 7,
};

const GEOMETRY_TYPES_INVERT = Object.fromEntries(
  Object.entries(GEOMETRY_TYPES).map((entry) => entry.reverse())
);

function resize(typedArray) {
  const newArray = Uint32Array(typedArray.byteLength * 2);
  newArray.set(newArray);
  return newArray;
}

function toMemory(features) {
  const coordinateArray = new Float64Array(512);
  const indexes = new Uint32Array(512);

  let indexIndex = 0;
  let coordinateIndex = 0;
  let simpleFeatures = [];

  function writeGeometry(geometry) {
    if (!geometry) {
      indexes[indexIndex++] = GEOMETRY_TYPES.None;
      return;
    }

    indexes[indexIndex++] = GEOMETRY_TYPES[geometry.type];

    switch (geometry.type) {
      case "GeometryCollection": {
        indexes[indexIndex++] = geometry.geometries.length;
        for (let geom of geometry.geometries) {
          writeGeometry(geom);
        }
        break;
      }
      case "Point": {
        const coordinate = geometry.coordinates;
        coordinateArray[coordinateIndex++] = coordinate[0];
        coordinateArray[coordinateIndex++] = coordinate[1];
        coordinateArray[coordinateIndex++] = coordinate[2] || 0;
        break;
      }
      case "MultiPoint":
      case "LineString": {
        indexes[indexIndex++] = geometry.coordinates.length;
        for (let coordinate of geometry.coordinates) {
          coordinateArray[coordinateIndex++] = coordinate[0];
          coordinateArray[coordinateIndex++] = coordinate[1];
          coordinateArray[coordinateIndex++] = coordinate[2] || 0;
        }
        break;
      }
      case "MultiLineString":
      case "Polygon": {
        indexes[indexIndex++] = geometry.coordinates.length;
        for (let ring of geometry.coordinates) {
          indexes[indexIndex++] = ring.length;
          for (let coordinate of ring) {
            coordinateArray[coordinateIndex++] = coordinate[0];
            coordinateArray[coordinateIndex++] = coordinate[1];
            coordinateArray[coordinateIndex++] = coordinate[2] || 0;
          }
        }
        break;
      }
      case "MultiPolygon": {
        indexes[indexIndex++] = geometry.coordinates.length;
        for (let polygon of geometry.coordinates) {
          indexes[indexIndex++] = polygon.length;
          for (let ring of polygon) {
            indexes[indexIndex++] = ring.length;
            for (let coordinate of ring) {
              coordinateArray[coordinateIndex++] = coordinate[0];
              coordinateArray[coordinateIndex++] = coordinate[1];
              coordinateArray[coordinateIndex++] = coordinate[2] || 0;
            }
          }
        }
        break;
      }
    }
  }

  for (let feature of features) {
    writeGeometry(feature.geometry);
    const { geometry, type, ...rest } = feature;
    simpleFeatures.push(rest);
  }

  return {
    coordinateArray,
    indexes,
    featureProperties: simpleFeatures,
  };
}

function fromMemory({ coordinateArray, indexes, featureProperties }) {
  const features = [];

  let indexIndex = 0;
  let coordinateIndex = 0;

  function decodeGeometry() {
    let geometryType = GEOMETRY_TYPES_INVERT[indexes[indexIndex++]];
    let coordinates;

    switch (geometryType) {
      case "None": {
        return null;
        break;
      }
      case "GeometryCollection": {
        const len = indexes[indexIndex++];
        const geometries = [];

        for (let i = 0; i < len; i++) {
          geometries.push(decodeGeometry());
        }

        return {
          type: "GeometryCollection",
          geometries,
        };
        break;
      }
      case "Point": {
        coordinates = [
          coordinateArray[coordinateIndex++],
          coordinateArray[coordinateIndex++],
          coordinateArray[coordinateIndex++],
        ];
        break;
      }
      case "MultiPoint":
      case "LineString": {
        const len = indexes[indexIndex++];
        coordinates = [];
        for (let i = 0; i < len; i++) {
          coordinates.push([
            coordinateArray[coordinateIndex++],
            coordinateArray[coordinateIndex++],
            coordinateArray[coordinateIndex++],
          ]);
        }
        break;
      }
      case "Polygon":
      case "MultiLineString": {
        const ringLength = indexes[indexIndex++];
        coordinates = [];
        for (let i = 0; i < ringLength; i++) {
          const len = indexes[indexIndex++];
          const ring = [];
          for (let i = 0; i < len; i++) {
            ring.push([
              coordinateArray[coordinateIndex++],
              coordinateArray[coordinateIndex++],
              coordinateArray[coordinateIndex++],
            ]);
          }
          coordinates.push(ring);
        }
        break;
      }
      case "MultiPolygon": {
        const polygonLength = indexes[indexIndex++];
        coordinates = [];
        for (let i = 0; i < polygonLength; i++) {
          const polygon = [];
          const ringLength = indexes[indexIndex++];
          for (let j = 0; j < ringLength; j++) {
            const len = indexes[indexIndex++];
            const ring = [];
            for (let i = 0; i < len; i++) {
              ring.push([
                coordinateArray[coordinateIndex++],
                coordinateArray[coordinateIndex++],
                coordinateArray[coordinateIndex++],
              ]);
            }
            polygon.push(ring);
          }
          coordinates.push(polygon);
        }
        break;
      }
    }
    return {
      type: geometryType,
      coordinates,
    };
  }

  for (let i = 0; i < featureProperties.length; i++) {
    features.push({
      ...featureProperties[i],
      type: "Feature",
      geometry: decodeGeometry(),
    });
  }

  return features;
}

test("memory-geojson", () => {
  const memory = toMemory(input);
  console.log(memory);
  assert.deepEqual(fromMemory(memory), input);
});
