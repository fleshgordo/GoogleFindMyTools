if(${IDF_TARGET} STREQUAL "esp32c3")
    set(SDKCONFIG_DEFAULTS "sdkconfig.defaults.esp32c3")
endif()

idf_component_register(SRCS "main.c"
                    INCLUDE_DIRS "."
                    REQUIRES nvs_flash bt # required to be able to #include esp_bt.h)
)