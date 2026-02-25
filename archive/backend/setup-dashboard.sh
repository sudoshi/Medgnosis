#!/bin/bash

# This will drop all tables, then run *all* migrations from scratch in order
php artisan migrate:fresh

# Now seed the database
php artisan db:seed --class=CoreReferenceSeeder
php artisan db:seed --class=TestPatientSeeder
php artisan db:seed --class=QualityMeasureSeeder

echo "Dashboard setup complete!"
