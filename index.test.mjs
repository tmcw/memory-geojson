import { describe, test } from "node:test";
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
      type: "Point",
      coordinates: [42.32, 24.2, 20],
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
          coordinates: [42.32, 24.2],
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

/**
 * Codes for each of the geometry types.
 */
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

function writeInt(typedArrayWrapper, index, val) {
  const typedArray = typedArrayWrapper._;
  const len = typedArray.length;
  if (index === len - 1) {
    const newArray = new Uint32Array(len * 2);
    newArray.set(typedArray);
    newArray[index] = val;
    typedArrayWrapper._ = newArray;
  } else {
    typedArray[index] = val;
  }
}

/**
 * Write a coordinate, a single number, to the array.
 * This will enlarge the array by a factor of 2
 * if it's too small.
 */
function writeCoordinate(typedArrayWrapper, index, val) {
  const typedArray = typedArrayWrapper._;
  const len = typedArray.length;
  if (index === len - 4) {
    const newArray = new Float64Array(len * 2);
    newArray.set(typedArray);
    newArray[index] = val;
    typedArrayWrapper._ = newArray;
  } else {
    typedArray[index] = val;
  }
}

function writePosition(coordinateArray, coordinate, coordinateIndex) {
  writeCoordinate(coordinateArray, coordinateIndex++, coordinate[0]);
  writeCoordinate(coordinateArray, coordinateIndex++, coordinate[1]);
  writeCoordinate(coordinateArray, coordinateIndex++, coordinate[2] ?? NONE);
  return coordinateIndex;
}

/**
 * z values are optional in coordinates. To make
 * them work with strictly-typed arrays that don't support
 * null, they're stored as NaN.
 */
const NONE = NaN;
function isSome(value) {
  return !isNaN(value);
}

function toMemory(features) {
  /**
   * These arrays are wrapped in objects so they can be
   * expanded when necessary. The object provides interior
   * mutability - TypedArrays can't be resized in place,
   * they need to be copied.
   *
   * NOTE: maybe we can estimate better how big to make
   * these initially, based on the number of features.
   */
  const coordinateArray = { _: new Float64Array(8) };
  /**
   * Counts and identifiers. This contains
   * the geometry type field, the counts of rings,
   * coordinates.
   */
  const indexes = { _: new Uint32Array(8) };
  const lookup = { _: new Uint32Array(8) };

  let indexIndex = 0;
  let coordinateIndex = 0;
  let simpleFeatures = [];

  function writeGeometry(geometry) {
    if (!geometry) {
      writeInt(indexes, indexIndex++, GEOMETRY_TYPES.None);
      return;
    }

    writeInt(indexes, indexIndex++, GEOMETRY_TYPES[geometry.type]);

    switch (geometry.type) {
      case "GeometryCollection": {
        writeInt(indexes, indexIndex++, geometry.geometries.length);
        for (let geom of geometry.geometries) {
          writeGeometry(geom);
        }
        break;
      }
      case "Point": {
        const coordinate = geometry.coordinates;
        coordinateIndex = writePosition(
          coordinateArray,
          coordinate,
          coordinateIndex
        );
        break;
      }
      case "MultiPoint":
      case "LineString": {
        writeInt(indexes, indexIndex++, geometry.coordinates.length);
        for (let coordinate of geometry.coordinates) {
          coordinateIndex = writePosition(
            coordinateArray,
            coordinate,
            coordinateIndex
          );
        }
        break;
      }
      case "MultiLineString":
      case "Polygon": {
        writeInt(indexes, indexIndex++, geometry.coordinates.length);
        for (let ring of geometry.coordinates) {
          writeInt(indexes, indexIndex++, ring.length);
          for (let coordinate of ring) {
            coordinateIndex = writePosition(
              coordinateArray,
              coordinate,
              coordinateIndex
            );
          }
        }
        break;
      }
      case "MultiPolygon": {
        writeInt(indexes, indexIndex++, geometry.coordinates.length);
        for (let polygon of geometry.coordinates) {
          writeInt(indexes, indexIndex++, polygon.length);
          for (let ring of polygon) {
            writeInt(indexes, indexIndex++, ring.length);
            for (let coordinate of ring) {
              coordinateIndex = writePosition(
                coordinateArray,
                coordinate,
                coordinateIndex
              );
            }
          }
        }
        break;
      }
    }
  }

  let lookupI = 0;
  for (let i = 0; i < features.length; i++) {
    writeInt(lookup, lookupI++, indexIndex);
    writeInt(lookup, lookupI++, coordinateIndex);
    const feature = features[i];
    writeGeometry(feature.geometry);
    const { geometry, type, ...rest } = feature;
    simpleFeatures.push(rest);
  }

  return {
    coordinateArray: coordinateArray._.subarray(0, coordinateIndex),
    indexes: indexes._.subarray(0, indexIndex),
    lookup: lookup._.subarray(0, lookupI),
    featureProperties: simpleFeatures,
  };
}

function getCoordinates(coordinateIndex, coordinateArray) {
  if (true) {
    const coordinates = [
      coordinateArray[coordinateIndex++],
      coordinateArray[coordinateIndex++],
    ];
    const z = coordinateArray[coordinateIndex++];
    if (isSome(z)) coordinates.push(z);
    return [coordinates, coordinateIndex];
  } else {
    const z = coordinateArray[coordinateIndex + 2];
    const size = isSome(z) ? 3 : 2;
    let coordinates = coordinateArray.slice(
      coordinateIndex,
      coordinateIndex + size
    );
    coordinateIndex += 3;
    return [coordinates, coordinateIndex];
  }
}

function decodeGeometry(indexIndex, indexes, coordinateIndex, coordinateArray) {
  const geometryCode = indexes[indexIndex++];
  let geometryType = GEOMETRY_TYPES_INVERT[geometryCode];
  let coordinates;

  if (geometryType === undefined) {
    throw new Error(`Unexpected geometry type code ${geometryCode}`);
  }

  switch (geometryType) {
    case "None": {
      return [indexIndex, coordinateIndex, null];
    }
    case "GeometryCollection": {
      const len = indexes[indexIndex++];
      const geometries = [];

      for (let i = 0; i < len; i++) {
        let geometry;
        [indexIndex, coordinateIndex, geometry] = decodeGeometry(
          indexIndex,
          indexes,
          coordinateIndex,
          coordinateArray
        );
        geometries.push(geometry);
      }

      return [
        indexIndex,
        coordinateIndex,
        {
          type: "GeometryCollection",
          geometries,
        },
      ];
    }
    case "Point": {
      [coordinates, coordinateIndex] = getCoordinates(
        coordinateIndex,
        coordinateArray
      );
      break;
    }
    case "MultiPoint":
    case "LineString": {
      const len = indexes[indexIndex++];
      coordinates = [];
      for (let i = 0; i < len; i++) {
        let position;
        [position, coordinateIndex] = getCoordinates(
          coordinateIndex,
          coordinateArray
        );
        coordinates.push(position);
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
          let position;
          [position, coordinateIndex] = getCoordinates(
            coordinateIndex,
            coordinateArray
          );
          ring.push(position);
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
            let position;
            [position, coordinateIndex] = getCoordinates(
              coordinateIndex,
              coordinateArray
            );
            ring.push(position);
          }
          polygon.push(ring);
        }
        coordinates.push(polygon);
      }
      break;
    }
  }
  return [
    indexIndex,
    coordinateIndex,
    {
      type: geometryType,
      coordinates,
    },
  ];
}

function arrayFromMemory({ coordinateArray, indexes, featureProperties }) {
  const features = [];

  let indexIndex = 0;
  let coordinateIndex = 0;

  for (let i = 0; i < featureProperties.length; i++) {
    let geometry;
    [indexIndex, coordinateIndex, geometry] = decodeGeometry(
      indexIndex,
      indexes,
      coordinateIndex,
      coordinateArray
    );
    features.push({
      ...featureProperties[i],
      type: "Feature",
      geometry,
    });
  }

  return features;
}

function featureFromMemory(
  { coordinateArray, lookup, indexes, featureProperties },
  i
) {
  let indexIndex = lookup[i * 2];
  let coordinateIndex = lookup[i * 2 + 1];

  let geometry;
  [indexIndex, coordinateIndex, geometry] = decodeGeometry(
    indexIndex,
    indexes,
    coordinateIndex,
    coordinateArray
  );
  return {
    ...featureProperties[i],
    type: "Feature",
    geometry,
  };
}

function deleteFeature(
  { coordinateArray, lookup, indexes, featureProperties },
  i
) {
  let indexIndex = lookup[i * 2];
  let coordinateIndex = lookup[i * 2 + 1];

  let nextIndexIndex = lookup[(i + 1) * 2];
  let nextCoordinateIndex = lookup[(i + 1) * 2 + 1];

  // Simple case - this is the last feature.
  if (nextIndexIndex === undefined) {
    return {
      lookup: lookup.subarray(0, i * 2),
      indexes: indexes.subarray(0, indexIndex),
      coordinateArray: coordinateArray.subarray(0, coordinateIndex),
      featureProperties: featureProperties.slice(0, i),
    };
  }

  throw new Error("TODO");
}

describe("memory-geojson", () => {
  test("round-trip", () => {
    const memory = toMemory(input);
    // console.log(memory);
    assert.deepStrictEqual(arrayFromMemory(memory), input);
  });
  test("seek", () => {
    const memory = toMemory(input);
    for (let i = 0; i < input.length; i++) {
      assert.deepStrictEqual(featureFromMemory(memory, i), input[i]);
    }
  });
  test("remove", () => {
    const memory = toMemory(input);
    const newMemory = deleteFeature(memory, input.length - 1);
    assert.equal(newMemory.lookup.length, memory.lookup.length - 2);
    for (let i = 0; i < input.length - 1; i++) {
      assert.deepStrictEqual(featureFromMemory(memory, i), input[i]);
    }
  });
});
