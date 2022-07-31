# memory-geojson (experimental 🧪)

A memory-efficient GeoJSON representation.

This is not a new format. It's not meant to be serialized, and it doesn't
add any features on top of the GeoJSON format.

What it attempts to do is provide an in-memory representation of GeoJSON
that uses TypedArrays to store flattened coordinates. The main benefits
and goals are:

- Reduce memory requirements of GeoJSON data.
- Support [transferrable](https://developer.mozilla.org/en-US/docs/Glossary/Transferable_objects) or
  [shared](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
  array buffers which make communication with WebWorkers much
  faster.

The GeoJSON format is almost perfect, but the way it represents
coordinates with nested arrays can be a performance issue. This
is an experiment to support flattened arrays.

Heavy inspiration taken from [mapshaper](https://github.com/mbloch/mapshaper)
perhaps the only tool that I know of that has a strategy of
flattening those arrays.

## Storage scheme

_This might change, I'm just braindumping what's in the code right now_.

This takes GeoJSON as input and stores it in three objects:

1. An array of objects called "featureProperties". This is where the "properties"
   data goes, as well as any data like bounding boxes or arbitrary data
   attached to the Feature object.
2. A Uint32Array of indexes, which informs the reader of the types of geometries
   and lengths of coordinate rings.
3. A Float64Array of coordinates.

Basically it's an offset based system. You read the file from
the start, and let's say the first feature has a Point geometry.
Point has a geometry code of 0, which informs the reader to
read the first 3 numbers from the coordinate array and move on.

If the next geometry is a LineString (code 2), then the reader
reads the next number from the indexes array, which contains
the number of coordinates in the linestring. Given that information,
it reads that number of coordinates and produces a LineString geometry.

## Discussion

This schema has tradeoffs.

- Seeking is difficult, there is currently no affordance for
  randomly jumping to and extracting a geometry. It's not entirely
  clear that this is necessary - skipping would be simple to implement.
  However, something like an index-of-indexes could be constructed.
- It's not clear yet how to encode the z index, the 3rd item in a
  GeoJSON Position. Right now this defaults that 3rd item to 0, but
  that is not ideal: a coordinate with z=0 is not the same as a coordinate
  with no z value. The latter implies that the z value is unknown, not 0.
- Could it be done with just one array, instead of separate
  arrays for indexes and coordinates?
- Should coordinates be Float32? I suspect that, while this would make
  encoding lossy (JavaScript floats are 52-bit), it would easily satisfy
  geospatial accuracy needs while halving the space requirement.
- Some data updates in this format would be very expensive, and also
  updates would require some fairly custom operations. For example,
  adding a new coordinate in the middle of a line, in the a feature
  in the middle of the dataset would require, probably,
  intelligently updating the LineString length, slicing the dataset
  into two TypedArrays, and plopping the new coordinate
  in the middle. It's doable, but makes updates much less
  obvious.
- Is it useful, or beneficial, to get fancy with properties? GeoJSON
  files certainly tend to share property names and often values, so
  it's conceivable that a bunch of features with a value for a property
  like "x" could have their values of "x" encoded as a flat array,
  hence saving valuable object space. But doing this well and not
  accidentally _increasing_ the memory requirements of some datasets
  seems like it would require compression-like logic.

## Running it

This repo is using Node's built-in test framework (as of Node v18).
So, have Node v18 and run `node --test`. No deps are required so far.

## Future

The future of this would be to use it in [Placemark](https://www.placemark.io/),
which would benefit from a more efficient memory encoding of features.
