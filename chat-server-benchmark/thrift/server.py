#!/usr/bin/env python3
"""Thrift server for chat server benchmark operations."""

import json
import os
import sys
import time

# Add current directory to path for generated thrift code
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import FUNCTIONS

from thrift.transport import TSocket, TTransport
from thrift.protocol import TBinaryProtocol, TCompactProtocol
from thrift.server.TServer import TThreadPoolServer

# Import generated thrift code
from chat_thrift import ChatService
from chat_thrift.ttypes import ComputeRequest, ComputeResponse


class ChatServiceHandler:
    def compute(self, request):
        start = time.time()
        operation = request.operation
        data = json.loads(request.payload.decode("utf-8"))
        fn = FUNCTIONS.get(operation)
        if not fn:
            raise ValueError(f"Unknown operation: {operation}")
        result = fn(data)
        elapsed = (time.time() - start) * 1000
        return ComputeResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )


def serve():
    handler = ChatServiceHandler()
    processor = ChatService.Processor(handler)
    transport = TSocket.TServerSocket("127.0.0.1", 50053)
    tfactory = TTransport.TBufferedTransportFactory()
    pfactory = TBinaryProtocol.TBinaryProtocolFactory()

    server = TThreadPoolServer(
        processor, transport, tfactory, pfactory
    )

    print("Thrift server started on port 50053", flush=True)
    server.serve()


if __name__ == "__main__":
    serve()
