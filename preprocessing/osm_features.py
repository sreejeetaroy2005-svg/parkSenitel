import os
import json
from functools import lru_cache
from typing import Tuple, Dict, Any, Optional

import osmnx as ox
import networkx as nx
import geopandas as gpd
from shapely.geometry import Point

# Configure OSMnx to use a local cache directory (within the project)
CACHE_DIR = os.path.join(os.path.dirname(__file__), "osm_cache")
ox.settings(use_cache=True, cache_folder=CACHE_DIR)

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two (lat, lon) pairs using haversine formula."""
    from math import radians, cos, sin, asin, sqrt

    # Earth radius in metres
    R = 6371000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c

# ---------------------------------------------------------------------------
# Graph loading (cached)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=3)
def load_graph(place: Optional[str] = None, bbox: Optional[Tuple[float, float, float, float]] = None) -> nx.MultiDiGraph:
    """Load an OSM road network either by place name or by bounding box.

    Parameters
    ----------
    place: str | None
        Human‑readable place string, e.g. "Delhi, India".
    bbox: tuple(min_lat, max_lat, min_lon, max_lon) | None
        Bounding box in decimal degrees.

    Returns
    -------
    networkx.MultiDiGraph
        Road network suitable for distance and connectivity queries.
    """
    if place:
        # Download the drivable road network for the supplied place.
        return ox.graph_from_place(place, network_type="drive")
    elif bbox:
        min_lat, max_lat, min_lon, max_lon = bbox
        # OSMnx expects north, south, east, west order.
        north, south, east, west = max_lat, min_lat, max_lon, min_lon
        return ox.graph_from_bbox(north, south, east, west, network_type="drive")
    else:
        raise ValueError("Either 'place' or 'bbox' must be provided to load_graph().")

# ---------------------------------------------------------------------------
# Road‑type mapping
# ---------------------------------------------------------------------------
ROAD_TYPE_WEIGHTS = {
    "motorway": 5,
    "trunk": 4,
    "primary": 4,
    "secondary": 3,
    "residential": 1,
}

def _most_common_road_type(node: int, G: nx.MultiDiGraph) -> Tuple[str, int]:
    """Determine the most frequent highway tag among edges incident to *node*.

    Returns a tuple of (road_type, weight). If no known type is found, returns
    ("residential", 1).
    """
    road_counter: Dict[str, int] = {}
    for _, _, data in G.edges(node, data=True):
        highway = data.get("highway")
        if isinstance(highway, list):
            # OSM can store multiple tags – count each.
            for h in highway:
                road_counter[h] = road_counter.get(h, 0) + 1
        elif isinstance(highway, str):
            road_counter[highway] = road_counter.get(highway, 0) + 1
    if not road_counter:
        return "residential", ROAD_TYPE_WEIGHTS["residential"]
    # Pick the most common known road type.
    for rt in ("motorway", "trunk", "primary", "secondary", "residential"):
        if rt in road_counter:
            return rt, ROAD_TYPE_WEIGHTS[rt]
    # Fallback to any available type with lowest weight.
    any_type = next(iter(road_counter))
    weight = ROAD_TYPE_WEIGHTS.get(any_type, 1)
    return any_type, weight

# ---------------------------------------------------------------------------
# Main feature extraction function
# ---------------------------------------------------------------------------
def compute_osm_features(lat: float, lon: float, graph: Optional[nx.MultiDiGraph] = None) -> Dict[str, Any]:
    """Compute OSM‑based road topology features for a hotspot centroid.

    Parameters
    ----------
    lat, lon : float
        Latitude and longitude of the hotspot centroid (WGS‑84).
    graph : networkx.MultiDiGraph | None
        Pre‑loaded OSM graph. If ``None``, a default graph for *Delhi, India* will
        be loaded (cached on first call).

    Returns
    -------
    dict
        Mapping of feature names to values:
        - ``distance_to_junction`` (float, metres)
        - ``road_type`` (str)
        - ``road_weight`` (int)
        - ``intersection_density`` (int, number of nodes within 200 m)
        - ``traffic_signal_present`` (bool)
        - ``connectivity_score`` (float, degree of the nearest node)
    """
    if graph is None:
        # Default to Delhi, India – the user can replace this with their own city.
        graph = load_graph(place="Delhi, India")

    # -------------------------------------------------------------------
    # 1️⃣ Nearest junction (node) and distance to it
    # -------------------------------------------------------------------
    # OSMnx expects (x, y) = (lon, lat)
    nearest_node = ox.distance.nearest_nodes(graph, X=lon, Y=lat)
    node_data = graph.nodes[nearest_node]
    node_lat = node_data.get("y")
    node_lon = node_data.get("x")
    distance_to_junction = _haversine_distance(lat, lon, node_lat, node_lon)

    # -------------------------------------------------------------------
    # 2️⃣ Road hierarchy & weight
    # -------------------------------------------------------------------
    road_type, road_weight = _most_common_road_type(nearest_node, graph)

    # -------------------------------------------------------------------
    # 3️⃣ Intersection density within a 200 m radius
    # -------------------------------------------------------------------
    radius_m = 200.0
    # Build a GeoDataFrame of all nodes for quick spatial count.
    nodes_gdf = gpd.GeoDataFrame(
        {"node": list(graph.nodes), "geometry": [Point(data["x"], data["y"]) for _, data in graph.nodes(data=True)]},
        crs="EPSG:4326",
    )
    centre_point = Point(lon, lat)
    # Buffer in metres requires projection; we approximate by haversine filter.
    def within_radius(row):
        return _haversine_distance(lat, lon, row.geometry.y, row.geometry.x) <= radius_m
    intersection_density = int(nodes_gdf.apply(within_radius, axis=1).sum())

    # -------------------------------------------------------------------
    # 4️⃣ Traffic signal presence within 200 m
    # -------------------------------------------------------------------
    traffic_signal_present = False
    for u, v, data in graph.edges(data=True):
        # Look for a node that is a traffic signal – OSM tags it as "highway": "traffic_signals"
        if data.get("highway") == "traffic_signals":
            # Check distance of *both* end points
            for nid in (u, v):
                nd = graph.nodes[nid]
                if _haversine_distance(lat, lon, nd["y"], nd["x"]) <= radius_m:
                    traffic_signal_present = True
                    break
        if traffic_signal_present:
            break

    # -------------------------------------------------------------------
    # 5️⃣ Connectivity score – degree of the nearest node (weighted by edge count)
    # -------------------------------------------------------------------
    connectivity_score = float(G.degree(nearest_node)) if (G := graph) else 0.0

    return {
        "distance_to_junction": distance_to_junction,
        "road_type": road_type,
        "road_weight": road_weight,
        "intersection_density": intersection_density,
        "traffic_signal_present": traffic_signal_present,
        "connectivity_score": connectivity_score,
    }

# ---------------------------------------------------------------------------
# Simple CLI for manual testing (optional)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Compute OSM features for a latitude/longitude point.")
    parser.add_argument("lat", type=float)
    parser.add_argument("lon", type=float)
    parser.add_argument("--place", default="Delhi, India")
    args = parser.parse_args()
    g = load_graph(place=args.place)
    feats = compute_osm_features(args.lat, args.lon, graph=g)
    print(json.dumps(feats, indent=2))
