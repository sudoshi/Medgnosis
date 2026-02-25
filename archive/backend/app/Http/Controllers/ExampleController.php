<?php

namespace App\Http\Controllers;

use App\Models\Example;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ExampleController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        $examples = Example::all();
        return response()->json($examples);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string'
        ]);

        $example = Example::create($validated);
        return response()->json($example, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Example $example): JsonResponse
    {
        return response()->json($example);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Example $example): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string'
        ]);

        $example->update($validated);
        return response()->json($example);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Example $example): JsonResponse
    {
        $example->delete();
        return response()->json(null, 204);
    }
}
