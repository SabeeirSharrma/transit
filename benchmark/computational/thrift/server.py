#!/usr/bin/env python3
"""Thrift server for computational benchmark."""

import json
import sys
import os
import time
import threading

# Add parent dir to path for shared module
_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _parent)

# After adding parent, the local 'thrift/' dir under _parent shadows the pip
# thrift package. We need to put the venv site-packages BEFORE _parent.
_venv_site = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "thrift", ".venv", "lib")
# Find the actual site-packages
import glob as _glob
_sp = _glob.glob(os.path.join(_venv_site, "python*", "site-packages"))
if _sp:
    sys.path.insert(0, _sp[0])

from thrift.transport import TSocket, TTransport
from thrift.protocol import TBinaryProtocol
from thrift.server import TServer

from shared.computations import OPERATIONS

import benchmark_thrift
from benchmark_thrift import BenchmarkService
from benchmark_thrift.ttypes import ComputeRequest, ComputeResponse, ComputeBatchRequest, ComputeBatchResponse


class BenchmarkServiceHandler:
    def compute(self, request):
        start = time.perf_counter()

        operation = request.operation
        payload = json.loads(request.payload.decode())

        fn = OPERATIONS.get(operation)
        if fn:
            result = fn(payload)
        else:
            result = {"error": f"Unknown operation: {operation}"}

        end = time.perf_counter()

        return ComputeResponse(
            result=json.dumps(result).encode(),
            execution_time_ms=(end - start) * 1000,
        )

    def computeBatch(self, request):
        start = time.perf_counter()
        responses = [self.compute(req) for req in request.requests]
        end = time.perf_counter()
        return ComputeBatchResponse(
            responses=responses,
            total_time_ms=(end - start) * 1000,
        )


def serve():
    handler = BenchmarkServiceHandler()
    processor = BenchmarkService.Processor(handler)
    transport = TSocket.TServerSocket(host="127.0.0.1", port=50053)
    tfactory = TTransport.TFramedTransportFactory()
    pfactory = TBinaryProtocol.TBinaryProtocolFactory()

    server = TServer.TThreadPoolServer(processor, transport, tfactory, pfactory)

    print("Thrift server started on port 50053", flush=True)
    server.serve()


if __name__ == "__main__":
    serve()
